const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Invoice = require('../models/invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Contract = require('../models/contract-model');
const Tenant = require('../models/tenant-model');
const Building = require('../models/building-model');

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
  return new Date(periodEnd);
};

// Calculate period dates based on payment frequency
const calculatePeriodDates = (contract, invoiceDate = new Date()) => {
  const leaseStart = new Date(contract.leaseStartDate || contract.date);
  const frequency = contract.paymentFrequency.toLowerCase();

  let periodStart, periodEnd;

  switch (frequency) {
    case 'monthly':
      const currentMonth = invoiceDate.getMonth();
      const currentYear = invoiceDate.getFullYear();
      periodStart = new Date(currentYear, currentMonth, 1);
      periodEnd = new Date(currentYear, currentMonth + 1, 0);
      break;
    case 'quarterly':
      const quarterStart = Math.floor(invoiceDate.getMonth() / 3) * 3;
      periodStart = new Date(invoiceDate.getFullYear(), quarterStart, 1);
      periodEnd = new Date(invoiceDate.getFullYear(), quarterStart + 3, 0);
      break;
    case 'every 6 months':
      const halfYear = invoiceDate.getMonth() < 6 ? 0 : 6;
      periodStart = new Date(invoiceDate.getFullYear(), halfYear, 1);
      periodEnd = new Date(invoiceDate.getFullYear(), halfYear + 6, 0);
      break;
    case 'yearly':
      periodStart = new Date(invoiceDate.getFullYear(), 0, 1);
      periodEnd = new Date(invoiceDate.getFullYear(), 11, 31);
      break;
    default:
      periodStart = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth(), 1);
      periodEnd = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + 1, 0);
  }

  return { periodStart, periodEnd };
};

// Calculate late penalty (Ethiopian context - simple daily penalty)
const calculateLatePenalty = (dueDate, paymentDate, rentAmount) => {
  const due = new Date(dueDate);
  const paid = new Date(paymentDate);

  if (paid <= due) return 0;

  const daysLate = Math.ceil((paid - due) / (1000 * 60 * 60 * 24));
  // 2% per month late penalty, converted to daily
  const dailyPenaltyRate = (rentAmount * 0.02) / 30;
  return Math.round(daysLate * dailyPenaltyRate);
};

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

    const invoiceDateObj = invoiceDate ? new Date(invoiceDate) : new Date();
    const { periodStart, periodEnd } = calculatePeriodDates(contract, invoiceDateObj);
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
      amountPaid: 0,
      outstandingBalance: contract.amount,
      status: 'pending'
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
    const targetDateObj = targetDate ? new Date(targetDate) : new Date();

    const filter = buildingId ? { building: buildingId } : {};
    const contracts = await Contract.find(filter).populate('tenant');

    const generatedInvoices = [];
    const errors = [];

    for (const contract of contracts) {
      try {
        const { periodStart, periodEnd } = calculatePeriodDates(contract, targetDateObj);

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
            status: 'pending'
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

    const paymentDateObj = paymentDate ? new Date(paymentDate) : new Date();
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

    res.json({
      message: "Payment recorded successfully",
      invoice,
      payment: paymentRecord
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get due date reminders
router.get('/invoices/reminders', async (req, res) => {
  try {
    const { daysAhead = 7 } = req.query;
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + parseInt(daysAhead));

    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }
    filter.status = 'pending';
    filter.dueDate = { $lte: reminderDate };

    const invoices = await Invoice.find(filter)
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: 1 });

    const reminders = invoices.map(invoice => ({
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      tenantName: invoice.tenant.tenantName,
      tenantPhone: invoice.tenant.phone,
      tenantEmail: invoice.tenant.email,
      amount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      daysUntilDue: Math.ceil((invoice.dueDate - new Date()) / (1000 * 60 * 60 * 24))
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
      .populate('tenant')
      .populate('contract')
      .sort({ dueDate: 1 });

    const overdue = invoices.map(invoice => {
      const daysOverdue = Math.ceil((new Date() - invoice.dueDate) / (1000 * 60 * 60 * 24));
      const latePenalty = calculateLatePenalty(invoice.dueDate, new Date(), invoice.rentAmount);

      return {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        tenantName: invoice.tenant.tenantName,
        tenantPhone: invoice.tenant.phone,
        tenantEmail: invoice.tenant.email,
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

// Update invoice status
router.patch('/invoices/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status, notes },
      { new: true }
    ).populate('tenant').populate('contract');

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({ message: "Invoice updated", invoice });
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