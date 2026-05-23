const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Invoice = require('../models/invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Contract = require('../models/contract-model');
const Tenant = require('../models/tenant-model');
const { runDueDateReminders } = require('../services/due-reminder-service');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  getInvoiceFieldsForContractStatus,
  setInvoiceStatusFields,
  syncContractStatusFromInvoices
} = require('../services/payment-status-sync-service');
const { getNextInvoicePeriod } = require('../services/invoice-period-service');
const { parseFlexibleDateInput } = require('../utils/date-utils');

const MAX_FILE_DATA_LENGTH = 7000000;

const normalizeReceiptFile = (file) => {
  if (!file) return undefined;
  if (!file.name || !file.type || !file.data || typeof file.data !== 'string') return null;
  if (file.data.length > MAX_FILE_DATA_LENGTH) return null;
  return {
    name: file.name,
    type: file.type,
    data: file.data
  };
};

// Generate invoice number
const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
};

// Calculate invoice due date using the end of the billing period
const calculateDueDate = (periodEnd) => {
  if (!periodEnd) return null;
  return parseFlexibleDateInput(periodEnd);
};

// Calculate late penalty (Ethiopian context - simple daily penalty)
const calculateLatePenalty = (dueDate, paymentDate, rentAmount) => {
  const due = parseFlexibleDateInput(dueDate);
  const paid = parseFlexibleDateInput(paymentDate);

  if (!due || !paid) return 0;

  if (paid <= due) return 0;

  // Fixed late penalty: 10% of the rent amount when payment is overdue
  const penalty = (Number(rentAmount) || 0) * 0.10;
  return Math.round(penalty);
};

const getInvoiceLabel = (invoice) => invoice.invoiceNumber || String(invoice._id);

// Get all invoices
router.get('/invoices', async (req, res) => {
  try {
    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }
    if (req.query.tenant) {
      if (!mongoose.Types.ObjectId.isValid(req.query.tenant)) {
        return res.status(400).json({ error: 'Invalid tenant id' });
      }
      filter.tenant = new mongoose.Types.ObjectId(req.query.tenant);
    }
    if (req.query.status) filter.status = req.query.status;

    const invoices = await Invoice.find(filter)
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: -1 });

    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate invoice for a tenant
router.post('/invoices/generate', async (req, res) => {
  try {
    const { tenantId, contractId, invoiceDate } = req.body;

    if (!tenantId || !contractId) {
      return res.status(400).json({ error: "Tenant ID and Contract ID are required" });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (String(contract.tenant) !== String(tenantId)) {
      return res.status(400).json({ error: "Selected contract does not belong to the chosen tenant" });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const invoiceDateObj = invoiceDate ? parseFlexibleDateInput(invoiceDate) : null;
    if (invoiceDate && !invoiceDateObj) {
      return res.status(400).json({ error: "Invalid invoice date" });
    }
    const period = await getNextInvoicePeriod(Invoice, contract, invoiceDateObj);

    if (!period?.periodStart || !period?.periodEnd) {
      return res.status(400).json({ error: "Contract has ended or has invalid lease dates" });
    }

    const { periodStart, periodEnd } = period;
    const dueDate = calculateDueDate(periodEnd);

    // Check if invoice already exists for this period
    const existingInvoice = await Invoice.findOne({
      tenant: tenantId,
      contract: contractId,
      periodStart: periodStart,
      periodEnd: periodEnd
    });

    if (existingInvoice) {
      return res.status(400).json({ error: "Invoice already exists for this period" });
    }

    const invoice = await Invoice.create({
      building: contract.building,
      tenant: tenantId,
      contract: contractId,
      invoiceNumber: generateInvoiceNumber(),
      periodStart,
      periodEnd,
      dueDate,
      rentAmount: contract.amount,
      totalAmount: contract.amount,
      ...getInvoiceFieldsForContractStatus(contract, contract.amount)
    });

    await recordAuditLog({
      building: invoice.building,
      action: "created",
      entityType: "invoice",
      entityId: invoice._id,
      entityLabel: getInvoiceLabel(invoice),
      message: `Invoice ${getInvoiceLabel(invoice)} generated`
    });

    res.json({ message: "Invoice generated successfully", invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-generate invoices for all active contracts
router.post('/invoices/auto-generate', async (req, res) => {
  try {
    const { buildingId, targetDate } = req.body;
    const targetDateObj = targetDate ? parseFlexibleDateInput(targetDate) : null;
    if (targetDate && !targetDateObj) {
      return res.status(400).json({ error: "Invalid target date" });
    }

    if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ error: 'Invalid building id' });
    }

    const filter = buildingId ? { building: buildingId } : {};
    const contracts = await Contract.find(filter).populate('tenant');

    const generatedInvoices = [];
    const errors = [];

    for (const contract of contracts) {
      try {
        if (!contract.tenant?._id) {
          throw new Error("Contract has no tenant");
        }

        const period = await getNextInvoicePeriod(Invoice, contract, targetDateObj);

        if (!period?.periodStart || !period?.periodEnd) {
          throw new Error("Contract has ended or has invalid lease dates");
        }

        const { periodStart, periodEnd } = period;

        // Check if invoice already exists
        const existingInvoice = await Invoice.findOne({
          tenant: contract.tenant._id,
          contract: contract._id,
          periodStart: periodStart,
          periodEnd: periodEnd
        });

        if (!existingInvoice) {
          const dueDate = calculateDueDate(periodEnd);

          const invoice = await Invoice.create({
            building: contract.building,
            tenant: contract.tenant._id,
            contract: contract._id,
            invoiceNumber: generateInvoiceNumber(),
            periodStart,
            periodEnd,
            dueDate,
            rentAmount: contract.amount,
            totalAmount: contract.amount,
            ...getInvoiceFieldsForContractStatus(contract, contract.amount)
          });

          generatedInvoices.push(invoice);
        }
      } catch (error) {
        errors.push({ contract: contract._id, error: error.message });
      }
    }

    if (generatedInvoices.length > 0) {
      await recordAuditLog({
        building: buildingId || generatedInvoices[0].building,
        action: "auto_generated",
        entityType: "invoice",
        message: `${generatedInvoices.length} invoices auto-generated`,
        metadata: {
          generated: generatedInvoices.map((invoice) => String(invoice._id))
        }
      });
    }

    res.json({
      message: `Generated ${generatedInvoices.length} invoices`,
      generated: generatedInvoices.length,
      errors: errors.length,
      invoices: generatedInvoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/invoices/reminders/send', async (req, res) => {
  try {
    const buildingId = req.body.building || req.query.building || "";

    if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    const result = await runDueDateReminders({
      daysAhead: req.body.daysAhead,
      sendSms: req.body.sendSms,
      sendEmail: req.body.sendEmail,
      buildingId
    });

    await recordAuditLog({
      building: buildingId || undefined,
      action: "sent",
      entityType: "reminder",
      message: `Manual reminder run checked ${result.checked || 0}, sent ${result.sent || 0}, failed ${result.failed || 0}`,
      metadata: result
    });

    const statusCode = result.failed > 0 && result.sent === 0 ? 400 : 200;
    res.status(statusCode).json({
      message: `Sent ${result.sent} due date reminder${result.sent === 1 ? '' : 's'}`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record payment for invoice
router.post('/invoices/:id/pay', async (req, res) => {
  try {
    const { paymentDate, amount, paymentMethod, reference, notes, receipt } = req.body;

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: "Invoice is already paid" });
    }

    const normalizedReceipt = normalizeReceiptFile(receipt);
    if (receipt && normalizedReceipt === null) {
      return res.status(400).json({ error: "Uploaded receipt is invalid or too large" });
    }

    const paymentDateObj = paymentDate ? parseFlexibleDateInput(paymentDate) : new Date();
    if (paymentDate && !paymentDateObj) {
      return res.status(400).json({ error: "Invalid payment date" });
    }
    const latePenalty = calculateLatePenalty(invoice.dueDate, paymentDateObj, invoice.rentAmount);
    const totalDue = invoice.rentAmount + latePenalty;
    const previousPaid = invoice.amountPaid || 0;
    const paymentValue = amount != null ? Number(amount) : Math.max(0, totalDue - previousPaid);

    if (paymentValue <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than zero" });
    }

    // Create payment record
    const paymentRecord = await PaymentRecord.create({
      building: invoice.building,
      tenant: invoice.tenant,
      invoice: invoice._id,
      paymentDate: paymentDateObj,
      amount: paymentValue,
      paymentMethod: paymentMethod || 'cash',
      reference: reference || '',
      notes: notes || '',
      receipt: normalizedReceipt
    });

    // Update invoice
    invoice.paymentDate = paymentDateObj;
    invoice.latePenalty = latePenalty;
    invoice.totalAmount = totalDue;
    invoice.amountPaid = previousPaid + paymentValue;
    invoice.outstandingBalance = Math.max(0, totalDue - invoice.amountPaid);
    invoice.status = invoice.outstandingBalance <= 0 ? 'paid' : 'pending';
    await invoice.save();
    await syncContractStatusFromInvoices(invoice.contract);

    await recordAuditLog({
      building: invoice.building,
      action: "recorded",
      entityType: "payment",
      entityId: paymentRecord._id,
      entityLabel: paymentRecord.reference || getInvoiceLabel(invoice),
      message: `Payment of Br ${paymentValue} recorded for invoice ${getInvoiceLabel(invoice)}`,
      metadata: {
        invoice: invoice._id,
        amount: paymentValue,
        paymentMethod: paymentRecord.paymentMethod
      }
    });

    res.json({
      message: "Payment recorded successfully",
      invoice,
      payment: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/invoices/reminders/history', async (req, res) => {
  try {
    const filter = { remindersSent: { $exists: true, $ne: [] } };

    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }

    const invoices = await Invoice.find(filter)
      .populate({
        path: 'tenant',
        populate: { path: 'unit', select: 'unitId' }
      })
      .sort({ updatedAt: -1 });

    const history = invoices.flatMap((invoice) =>
      (invoice.remindersSent || []).map((reminder) => ({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        tenantName: invoice.tenant?.tenantName || "",
        tenantUnit: invoice.tenant?.unit?.unitId || "",
        type: reminder.type,
        sentAt: reminder.sentAt,
        message: reminder.message || ""
      }))
    ).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get due date reminders
router.get('/invoices/reminders', async (req, res) => {
  try {
    const parsedDaysAhead = Number.parseInt(req.query.daysAhead || '7', 10);
    const daysAhead = Number.isFinite(parsedDaysAhead) ? parsedDaysAhead : 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderDate = new Date(today);
    reminderDate.setDate(reminderDate.getDate() + daysAhead);
    reminderDate.setHours(23, 59, 59, 999);

    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }
    filter.status = 'pending';
    filter.dueDate = { $gte: today, $lte: reminderDate };

    const invoices = await Invoice.find(filter)
      .populate({
        path: 'tenant',
        populate: { path: 'unit', select: 'unitId' }
      })
      .populate('contract')
      .sort({ dueDate: 1 });

    const reminders = invoices.map(invoice => ({
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      tenantName: invoice.tenant?.tenantName || '',
      tenantPhone: invoice.tenant?.phone || '',
      tenantEmail: invoice.tenant?.email || '',
      tenantUnit: invoice.tenant?.unit?.unitId || '',
      amount: invoice.outstandingBalance || invoice.totalAmount,
      dueDate: invoice.dueDate,
      daysUntilDue: Math.ceil((invoice.dueDate - today) / (1000 * 60 * 60 * 24))
    }));

    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get overdue invoices
router.get('/invoices/overdue', async (req, res) => {
  try {
    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }
    filter.status = 'pending';
    filter.dueDate = { $lt: new Date() };

    const invoices = await Invoice.find(filter)
      .populate({
        path: 'tenant',
        populate: { path: 'unit', select: 'unitId' }
      })
      .populate('contract')
      .sort({ dueDate: 1 });

    const overdue = invoices.map(invoice => {
      const daysOverdue = Math.ceil((new Date() - invoice.dueDate) / (1000 * 60 * 60 * 24));
      const latePenalty = calculateLatePenalty(invoice.dueDate, new Date(), invoice.rentAmount);

      return {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        tenantName: invoice.tenant?.tenantName || '',
        tenantPhone: invoice.tenant?.phone || '',
        tenantEmail: invoice.tenant?.email || '',
        tenantUnit: invoice.tenant?.unit?.unitId || '',
        amount: invoice.rentAmount,
        latePenalty,
        totalAmount: invoice.rentAmount + latePenalty,
        dueDate: invoice.dueDate,
        daysOverdue
      };
    });

    res.json(overdue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Monthly income report
router.get('/reports/monthly-income', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    const buildingId = req.query.building;

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Query parameters year and month are required' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    const match = { paymentDate: { $gte: startDate, $lt: endDate } };

    if (buildingId) {
      if (!mongoose.Types.ObjectId.isValid(buildingId)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      match.building = new mongoose.Types.ObjectId(buildingId);
    }

    const result = await PaymentRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      }
    ]);

    const summary = result[0] || { totalIncome: 0, paymentCount: 0 };
    res.json({ year, month, buildingId: buildingId || null, totalIncome: summary.totalIncome, paymentCount: summary.paymentCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Building income report
router.get('/reports/building-income', async (req, res) => {
  try {
    const buildingId = req.query.building;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;

    if (!buildingId) {
      return res.status(400).json({ error: 'Building ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ error: 'Invalid building id' });
    }

    const startDate = year ? new Date(year, 0, 1) : new Date(1900, 0, 1);
    const endDate = year ? new Date(year + 1, 0, 1) : new Date(9999, 0, 1);

    const breakdown = await PaymentRecord.aggregate([
      {
        $match: {
          building: new mongoose.Types.ObjectId(buildingId),
          paymentDate: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$paymentDate' },
            month: { $month: '$paymentDate' }
          },
          totalIncome: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      }
    ]);

    const results = breakdown.map(item => ({
      year: item._id.year,
      month: item._id.month,
      totalIncome: item.totalIncome,
      paymentCount: item.paymentCount
    }));

    const totalIncome = results.reduce((sum, item) => sum + item.totalIncome, 0);
    res.json({ buildingId, year: year || 'all', totalIncome, breakdown: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Outstanding rent report
router.get('/reports/outstanding-rent', async (req, res) => {
  try {
    const filter = { outstandingBalance: { $gt: 0 } };
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }

    const invoices = await Invoice.find(filter)
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: 1 });

    const totalOutstanding = invoices.reduce((sum, invoice) => sum + (invoice.outstandingBalance || 0), 0);
    const reportItems = invoices.map(invoice => ({
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      tenantName: invoice.tenant?.tenantName || '',
      building: invoice.building,
      contract: invoice.contract,
      outstandingBalance: invoice.outstandingBalance || 0,
      dueDate: invoice.dueDate,
      status: invoice.status
    }));

    res.json({ buildingId: req.query.building || null, totalOutstanding, count: reportItems.length, invoices: reportItems });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/invoices/:id/receipt', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('tenant').populate('contract');

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const payments = await PaymentRecord.find({ invoice: invoice._id }).sort({ paymentDate: -1 });

    res.json({
      invoice,
      payments,
      generatedAt: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update invoice status
router.patch('/invoices/:id', async (req, res) => {
  try {
    const {
      dueDate,
      periodStart,
      periodEnd,
      totalAmount,
      status,
      notes
    } = req.body;

    if (status && !['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid invoice status" });
    }

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    let dueDateChanged = false;
    if (dueDate) {
      const nextDueDate = parseFlexibleDateInput(dueDate);

      if (!nextDueDate) {
        return res.status(400).json({ error: "Invalid due date" });
      }

      // compare by milliseconds to avoid timezone/ISO-string edge cases
      const prevMs = invoice.dueDate ? new Date(invoice.dueDate).getTime() : null;
      const nextMs = new Date(nextDueDate).getTime();

      if (prevMs !== nextMs) {
        // clear previous reminders so a new reminder can be sent for the updated date
        invoice.remindersSent = [];
        dueDateChanged = true;
        console.log(`Invoice ${invoice._id}: dueDate changed from ${prevMs ? new Date(prevMs).toISOString() : 'none'} to ${new Date(nextMs).toISOString()}`);
      }

      invoice.dueDate = nextDueDate;
    }

    if (periodStart) {
      const nextPeriodStart = parseFlexibleDateInput(periodStart);

      if (!nextPeriodStart) {
        return res.status(400).json({ error: "Invalid period start date" });
      }

      invoice.periodStart = nextPeriodStart;
    }

    if (periodEnd) {
      const nextPeriodEnd = parseFlexibleDateInput(periodEnd);

      if (!nextPeriodEnd) {
        return res.status(400).json({ error: "Invalid period end date" });
      }

      invoice.periodEnd = nextPeriodEnd;
    }

    if (invoice.periodStart && invoice.periodEnd && invoice.periodEnd < invoice.periodStart) {
      return res.status(400).json({ error: "Period end cannot be before period start" });
    }

    if (invoice.dueDate && invoice.periodStart && invoice.dueDate < invoice.periodStart) {
      return res.status(400).json({ error: "Due date cannot be before period start" });
    }

    const previousStatus = invoice.status;

    if (totalAmount !== undefined) {
      const normalizedTotal = Number(totalAmount);

      if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
        return res.status(400).json({ error: "Total amount must be greater than zero" });
      }

      invoice.rentAmount = normalizedTotal;
      invoice.totalAmount = normalizedTotal + (invoice.latePenalty || 0);
      invoice.outstandingBalance = Math.max(0, invoice.totalAmount - (invoice.amountPaid || 0));
    }

    if (status) {
      setInvoiceStatusFields(invoice, status, {
        resetPaidAmount: previousStatus === "paid" && status === "pending"
      });
    }

    if (notes !== undefined) {
      invoice.notes = String(notes || '').trim();
    }

    await invoice.save();
    await syncContractStatusFromInvoices(invoice.contract);
    await invoice.populate('tenant');
    await invoice.populate('contract');

    await recordAuditLog({
      building: invoice.building,
      action: "updated",
      entityType: "invoice",
      entityId: invoice._id,
      entityLabel: getInvoiceLabel(invoice),
      message: `Invoice ${getInvoiceLabel(invoice)} updated`,
      metadata: {
        dueDateChanged,
        previousStatus,
        status: invoice.status
      }
    });

    res.json({ message: "Invoice updated", invoice });

    // If due date changed, trigger reminder job for the building in background.
    // Do not await to avoid delaying the HTTP response.
    if (dueDateChanged) {
      try {
        const buildingId = invoice.building ? String(invoice.building) : undefined;
        console.log(`Scheduling due-date reminder run for building ${buildingId || 'all'} (invoice ${invoice._id})`);
        setTimeout(async () => {
          try {
            // run due date reminders for this building only
            await runDueDateReminders({ buildingId });
          } catch (err) {
            console.error('Failed to run due date reminders after invoice update:', err);
          }
        }, 1000);
      } catch (err) {
        console.error('Failed to schedule due date reminder run:', err);
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invoice
router.delete('/invoices/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Delete associated payment records
    await PaymentRecord.deleteMany({ invoice: req.params.id });
    await syncContractStatusFromInvoices(invoice.contract);

    await recordAuditLog({
      building: invoice.building,
      action: "deleted",
      entityType: "invoice",
      entityId: invoice._id,
      entityLabel: getInvoiceLabel(invoice),
      message: `Invoice ${getInvoiceLabel(invoice)} deleted`
    });

    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get payment records
router.get('/payment-records', async (req, res) => {
  try {
    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }
    if (req.query.tenant) {
      if (!mongoose.Types.ObjectId.isValid(req.query.tenant)) {
        return res.status(400).json({ error: 'Invalid tenant id' });
      }
      filter.tenant = new mongoose.Types.ObjectId(req.query.tenant);
    }
    if (req.query.invoice) {
      if (!mongoose.Types.ObjectId.isValid(req.query.invoice)) {
        return res.status(400).json({ error: 'Invalid invoice id' });
      }
      filter.invoice = new mongoose.Types.ObjectId(req.query.invoice);
    }
    if (req.query.contract) {
      if (!mongoose.Types.ObjectId.isValid(req.query.contract)) {
        return res.status(400).json({ error: 'Invalid contract id' });
      }
      filter.contract = new mongoose.Types.ObjectId(req.query.contract);
    }
    if (req.query.utility) {
      if (!mongoose.Types.ObjectId.isValid(req.query.utility)) {
        return res.status(400).json({ error: 'Invalid utility id' });
      }
      filter.utility = new mongoose.Types.ObjectId(req.query.utility);
    }

    const payments = await PaymentRecord.find(filter)
      .populate({
        path: 'tenant',
        populate: { path: 'unit', select: 'unitId' }
      })
      .populate('invoice')
      .populate('contract')
      .populate('utility')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
