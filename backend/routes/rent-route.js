const express = require('express');
const router = express.Router();
const RentInvoice = require('../models/rent-invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Contract = require('../models/contract-model');
const Tenant = require('../models/tenant-model');
const Building = require('../models/building-model');

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

// Get all rent invoices
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

// Generate rent invoice for a tenant
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

    const invoiceDateObj = invoiceDate ? new Date(invoiceDate) : new Date();
    const { periodStart, periodEnd } = calculatePeriodDates(contract, invoiceDateObj);
    const dueDate = calculateDueDate(periodEnd);

    // Check if invoice already exists for this period
    const existingInvoice = await RentInvoice.findOne({
      tenant: tenantId,
      contract: contractId,
      periodStart: periodStart,
      periodEnd: periodEnd
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
      status: 'pending'
    });

    res.json({ message: "Rent invoice generated successfully", invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-generate invoices for all active contracts
router.post('/rent-invoices/auto-generate', async (req, res) => {
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
        const existingInvoice = await RentInvoice.findOne({
          tenant: contract.tenant._id,
          contract: contract._id,
          periodStart: periodStart,
          periodEnd: periodEnd
        });

        if (!existingInvoice) {
          const dueDate = calculateDueDate(periodEnd);

          const invoice = await RentInvoice.create({
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
router.post('/rent-invoices/:id/pay', async (req, res) => {
  try {
    const { paymentDate, amount, paymentMethod, reference, notes } = req.body;

    const invoice = await RentInvoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: "Invoice is already paid" });
    }

    const paymentDateObj = paymentDate ? new Date(paymentDate) : new Date();
    const latePenalty = calculateLatePenalty(invoice.dueDate, paymentDateObj, invoice.rentAmount);
    const totalAmount = invoice.rentAmount + latePenalty;
    const paymentValue = amount != null ? Number(amount) : totalAmount;

    // Create payment record
    const paymentRecord = await PaymentRecord.create({
      building: invoice.building,
      tenant: invoice.tenant,
      invoice: invoice._id,
      paymentDate: paymentDateObj,
      amount: paymentValue,
      paymentMethod: paymentMethod || 'cash',
      reference: reference || '',
      notes: notes || ''
    });

    // Update invoice
    invoice.paymentDate = paymentDateObj;
    invoice.latePenalty = latePenalty;
    invoice.totalAmount = totalAmount;
    invoice.status = paymentValue >= totalAmount ? 'paid' : 'pending';
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
router.get('/rent-invoices/reminders', async (req, res) => {
  try {
    const { daysAhead = 7 } = req.query;
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + parseInt(daysAhead));

    const filter = req.query.building ? { building: req.query.building } : {};
    filter.status = 'pending';
    filter.dueDate = { $lte: reminderDate };

    const invoices = await RentInvoice.find(filter)
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
router.get('/rent-invoices/overdue', async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    filter.status = 'pending';
    filter.dueDate = { $lt: new Date() };

    const invoices = await RentInvoice.find(filter)
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

// Update invoice status
router.patch('/rent-invoices/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;

    const invoice = await RentInvoice.findByIdAndUpdate(
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
router.delete('/rent-invoices/:id', async (req, res) => {
  try {
    const invoice = await RentInvoice.findByIdAndDelete(req.params.id);

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