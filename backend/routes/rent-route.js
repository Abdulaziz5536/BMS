const express = require('express');
const router = express.Router();
const RentInvoice = require('../models/rent-invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Contract = require('../models/contract-model');
const Tenant = require('../models/tenant-model');
const { runDueDateReminders } = require('../services/due-reminder-service');
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

const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
};

const calculateDueDate = (periodEnd) => {
  if (!periodEnd) return null;
  return parseFlexibleDateInput(periodEnd);
};

const calculateLatePenalty = (dueDate, paymentDate, rentAmount) => {
  const due = parseFlexibleDateInput(dueDate);
  const paid = parseFlexibleDateInput(paymentDate);

  if (!due || !paid) return 0;

  if (paid <= due) return 0;

  const daysLate = Math.ceil((paid - due) / (1000 * 60 * 60 * 24));
  const dailyPenaltyRate = (rentAmount * 0.02) / 30;
  return Math.round(daysLate * dailyPenaltyRate);
};

router.get('/rent-invoices', async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    if (req.query.tenant) filter.tenant = req.query.tenant;
    if (req.query.status) filter.status = req.query.status;

    const invoices = await RentInvoice.find(filter)
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: -1 });

    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rent-invoices/generate', async (req, res) => {
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
    const period = await getNextInvoicePeriod(RentInvoice, contract, invoiceDateObj);

    if (!period?.periodStart || !period?.periodEnd) {
      return res.status(400).json({ error: "Contract has ended or has invalid lease dates" });
    }

    const { periodStart, periodEnd } = period;
    const dueDate = calculateDueDate(periodEnd);

    const existingInvoice = await RentInvoice.findOne({
      tenant: tenantId,
      contract: contractId,
      periodStart,
      periodEnd
    });

    if (existingInvoice) {
      return res.status(400).json({ error: "Invoice already exists for this period" });
    }

    const invoice = await RentInvoice.create({
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

    res.json({ message: "Rent invoice generated successfully", invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rent-invoices/auto-generate', async (req, res) => {
  try {
    const { buildingId, targetDate } = req.body;
    const targetDateObj = targetDate ? parseFlexibleDateInput(targetDate) : null;
    if (targetDate && !targetDateObj) {
      return res.status(400).json({ error: "Invalid target date" });
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

        const period = await getNextInvoicePeriod(RentInvoice, contract, targetDateObj);

        if (!period?.periodStart || !period?.periodEnd) {
          throw new Error("Contract has ended or has invalid lease dates");
        }

        const { periodStart, periodEnd } = period;
        const existingInvoice = await RentInvoice.findOne({
          tenant: contract.tenant._id,
          contract: contract._id,
          periodStart,
          periodEnd
        });

        if (!existingInvoice) {
          const invoice = await RentInvoice.create({
            building: contract.building,
            tenant: contract.tenant._id,
            contract: contract._id,
            invoiceNumber: generateInvoiceNumber(),
            periodStart,
            periodEnd,
            dueDate: calculateDueDate(periodEnd),
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

router.post('/rent-invoices/reminders/send', async (req, res) => {
  try {
    const result = await runDueDateReminders({
      daysAhead: req.body.daysAhead,
      sendSms: req.body.sendSms,
      sendEmail: req.body.sendEmail
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

router.post('/rent-invoices/:id/pay', async (req, res) => {
  try {
    const { paymentDate, amount, paymentMethod, reference, notes, receipt } = req.body;

    const invoice = await RentInvoice.findById(req.params.id);
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

    invoice.paymentDate = paymentDateObj;
    invoice.latePenalty = latePenalty;
    invoice.totalAmount = totalDue;
    invoice.amountPaid = previousPaid + paymentValue;
    invoice.outstandingBalance = Math.max(0, totalDue - invoice.amountPaid);
    invoice.status = invoice.outstandingBalance <= 0 ? 'paid' : 'pending';
    await invoice.save();
    await syncContractStatusFromInvoices(invoice.contract);

    res.json({
      message: "Payment recorded successfully",
      invoice,
      payment: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rent-invoices/reminders', async (req, res) => {
  try {
    const daysAhead = Number.parseInt(req.query.daysAhead || '7', 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderDate = new Date(today);
    reminderDate.setDate(reminderDate.getDate() + (Number.isFinite(daysAhead) ? daysAhead : 7));
    reminderDate.setHours(23, 59, 59, 999);

    const filter = req.query.building ? { building: req.query.building } : {};
    filter.status = 'pending';
    filter.dueDate = { $gte: today, $lte: reminderDate };

    const invoices = await RentInvoice.find(filter)
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: 1 });

    const reminders = invoices.map(invoice => ({
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      tenantName: invoice.tenant?.tenantName || '',
      tenantPhone: invoice.tenant?.phone || '',
      tenantEmail: invoice.tenant?.email || '',
      amount: invoice.outstandingBalance || invoice.totalAmount,
      dueDate: invoice.dueDate,
      daysUntilDue: Math.ceil((invoice.dueDate - today) / (1000 * 60 * 60 * 24))
    }));

    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rent-invoices/overdue', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filter = req.query.building ? { building: req.query.building } : {};
    filter.status = 'pending';
    filter.dueDate = { $lt: today };

    const invoices = await RentInvoice.find(filter)
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: 1 });

    const overdue = invoices.map(invoice => {
      const daysOverdue = Math.ceil((today - invoice.dueDate) / (1000 * 60 * 60 * 24));
      const latePenalty = calculateLatePenalty(invoice.dueDate, today, invoice.rentAmount);

      return {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        tenantName: invoice.tenant?.tenantName || '',
        tenantPhone: invoice.tenant?.phone || '',
        tenantEmail: invoice.tenant?.email || '',
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

router.patch('/rent-invoices/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (status && !['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid invoice status" });
    }

    const invoice = await RentInvoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const previousStatus = invoice.status;

    if (status) {
      setInvoiceStatusFields(invoice, status, {
        resetPaidAmount: previousStatus === "paid" && status === "pending"
      });
    }

    if (notes !== undefined) {
      invoice.notes = String(notes || "").trim();
    }

    await invoice.save();
    await syncContractStatusFromInvoices(invoice.contract);
    await invoice.populate('tenant');
    await invoice.populate('contract');

    res.json({ message: "Invoice updated", invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/rent-invoices/:id', async (req, res) => {
  try {
    const invoice = await RentInvoice.findByIdAndDelete(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    await PaymentRecord.deleteMany({ invoice: req.params.id });
    await syncContractStatusFromInvoices(invoice.contract);

    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/payment-records', async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    if (req.query.tenant) filter.tenant = req.query.tenant;
    if (req.query.invoice) filter.invoice = req.query.invoice;

    const payments = await PaymentRecord.find(filter)
      .populate('tenant')
      .populate('invoice')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
