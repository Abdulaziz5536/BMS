const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Invoice = require('../models/invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Contract = require('../models/contract-model');
const Tenant = require('../models/tenant-model');
const {
  clearReminderHistoryForScheduleChange,
  getDaysUntilDue,
  runDueDateReminders
} = require('../services/due-reminder-service');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  getNewInvoicePaymentFields,
  setInvoiceStatusFields,
  syncContractStatusFromInvoices
} = require('../services/payment-status-sync-service');
const { syncPaymentRecordForPaidEntity } = require('../services/payment-record-service');
const { getNextInvoicePeriod } = require('../services/invoice-period-service');
const {
  syncPendingUtilitiesToInvoiceDueDate,
  syncPendingUtilitiesToLatestTenantInvoiceDueDate
} = require('../services/utility-invoice-sync-service');
const {
  ethiopianToGregorian,
  getEthiopianMonthRange,
  parseFlexibleDateInput,
  parsePaymentDateInput
} = require('../utils/date-utils');
const { calculateLatePenalty } = require('../utils/late-penalty-utils');

const MAX_FILE_DATA_LENGTH = 7000000;

// Invoice routes handle rent billing, payment recording, receipts, reminder lists,
// and income/outstanding reports. Status fields are kept in sync with contracts.

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

const getInvoiceLabel = (invoice) => invoice.invoiceNumber || String(invoice._id);

const startOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isInvoiceDueBy = (invoice, referenceDate = new Date()) => {
  if (!invoice?.dueDate) {
    return false;
  }

  const dueDate = startOfDay(invoice.dueDate);
  return !Number.isNaN(dueDate.getTime()) && dueDate <= startOfDay(referenceDate);
};

const getDateOnlyTime = (value) => {
  const date = parseFlexibleDateInput(value);
  return date ? date.getTime() : null;
};

const isInvoiceDueBefore = (invoice, cutoffDate) => {
  const dueTime = getDateOnlyTime(invoice?.dueDate);
  const cutoffTime = getDateOnlyTime(cutoffDate);

  return dueTime !== null && cutoffTime !== null && dueTime < cutoffTime;
};

const isDateInRange = (value, startDate, endDate) => {
  const dateTime = getDateOnlyTime(value);
  const startTime = getDateOnlyTime(startDate);
  const endTime = getDateOnlyTime(endDate);

  return dateTime !== null && startTime !== null && endTime !== null && dateTime >= startTime && dateTime < endTime;
};

const getRequestedEthiopianMonthRange = (query, referenceDate = new Date()) => {
  const currentRange = getEthiopianMonthRange(referenceDate);
  const year = Number.parseInt(query.ethiopianYear || currentRange.ethiopianYear, 10);
  const month = Number.parseInt(query.ethiopianMonth || currentRange.ethiopianMonth, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 13) {
    return null;
  }

  const start = ethiopianToGregorian(year, month, 1);
  const nextMonth = month === 13
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
  const end = ethiopianToGregorian(nextMonth.year, nextMonth.month, 1);

  if (!start || !end) {
    return null;
  }

  return {
    start,
    end,
    ethiopianYear: year,
    ethiopianMonth: month,
    isCurrentMonth: year === currentRange.ethiopianYear && month === currentRange.ethiopianMonth
  };
};

const getInvoiceOutstandingBalance = (invoice) =>
  Number(invoice?.outstandingBalance ?? Math.max(0, Number(invoice?.totalAmount || 0) - Number(invoice?.amountPaid || 0)));

const getPaymentStatusItem = (tenant, invoice = null, options = {}) => {
  const rawOutstandingBalance = invoice ? getInvoiceOutstandingBalance(invoice) : 0;
  const hasDueInvoice = Boolean(invoice) && (
    options.dueCutoffDate
      ? isInvoiceDueBefore(invoice, options.dueCutoffDate)
      : isInvoiceDueBy(invoice, options.referenceDate)
  );
  const outstandingBalance = hasDueInvoice ? rawOutstandingBalance : 0;
  const isPaid = invoice?.status === "paid";
  const amountPaid = Number(invoice?.amountPaid || 0);
  const amountDue = isPaid ? amountPaid : rawOutstandingBalance;
  const displayDate = isPaid && invoice?.paymentDate ? invoice.paymentDate : invoice?.dueDate || null;
  const sourceTenant = tenant || invoice?.tenant || {};

  return {
    tenantId: sourceTenant?._id || null,
    tenantName: sourceTenant?.tenantName || "Tenant",
    tenantPhone: sourceTenant?.phone || "",
    tenantEmail: sourceTenant?.email || "",
    tenantUnit: sourceTenant?.unit?.unitId || "",
    invoiceId: invoice?._id || null,
    invoiceNumber: invoice?.invoiceNumber || "",
    periodStart: invoice?.periodStart || null,
    periodEnd: invoice?.periodEnd || null,
    dueDate: invoice?.dueDate || null,
    paymentDate: invoice?.paymentDate || null,
    totalAmount: Number(invoice?.totalAmount || 0),
    amountPaid,
    outstandingBalance,
    amountDue,
    displayAmount: amountDue,
    displayDate,
    displayDateLabel: isPaid && invoice?.paymentDate ? "Paid" : "Due",
    invoiceOutstandingBalance: rawOutstandingBalance,
    hasDueInvoice,
    status: isPaid ? "paid" : "not_paid",
    invoiceStatus: invoice?.status || "no_invoice",
    hasInvoice: Boolean(invoice)
  };
};

// Simple read-only payment status view for family/viewer accounts.
router.get('/payment-status', async (req, res) => {
  try {
    const filter = {};
    const today = startOfDay();
    const ethiopianMonthRange = getRequestedEthiopianMonthRange(req.query, today);

    if (!ethiopianMonthRange) {
      return res.status(400).json({ error: "Invalid Ethiopian month" });
    }

    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }

    const tenants = await Tenant.find(filter)
      .populate({ path: 'unit', select: 'unitId' })
      .sort({ tenantName: 1 });

    const invoices = await Invoice.find(filter)
      .populate({
        path: 'tenant',
        populate: { path: 'unit', select: 'unitId' }
      })
      .sort({ dueDate: -1, createdAt: -1 });

    const paidInvoiceByTenant = new Map();
    const notPaidInvoiceByTenant = new Map();
    const invoicesWithoutTenant = [];
    let totalOutstanding = 0;
    const currentMonthStart = ethiopianMonthRange.start;
    const nextMonthStart = ethiopianMonthRange.end;
    const notPaidDueCutoffDate = new Date(today);
    notPaidDueCutoffDate.setDate(notPaidDueCutoffDate.getDate() + 8);

    const shouldReplacePaidInvoice = (currentInvoice, nextInvoice) => {
      if (!currentInvoice) {
        return true;
      }

      const currentPaymentTime = getDateOnlyTime(currentInvoice.paymentDate) || 0;
      const nextPaymentTime = getDateOnlyTime(nextInvoice.paymentDate) || 0;

      return nextPaymentTime > currentPaymentTime;
    };

    const shouldReplaceNotPaidInvoice = (currentInvoice, nextInvoice) => {
      if (!currentInvoice) {
        return true;
      }

      const currentDueTime = getDateOnlyTime(currentInvoice.dueDate) || 0;
      const nextDueTime = getDateOnlyTime(nextInvoice.dueDate) || 0;

      return nextDueTime < currentDueTime;
    };

    const getPaymentStatusVisibility = (invoice) => {
      if (!invoice || invoice.status === "cancelled") {
        return false;
      }

      if (invoice.status === "paid") {
        return isDateInRange(invoice.paymentDate, currentMonthStart, nextMonthStart) ? "paid" : false;
      }

      return isInvoiceDueBefore(invoice, notPaidDueCutoffDate) && getInvoiceOutstandingBalance(invoice) > 0
        ? "not_paid"
        : false;
    };

    invoices.forEach((invoice) => {
      const tenantId = invoice.tenant?._id ? String(invoice.tenant._id) : "";
      const visibility = getPaymentStatusVisibility(invoice);
      const outstandingBalance = getInvoiceOutstandingBalance(invoice);

      if (visibility === "not_paid" && outstandingBalance > 0) {
        totalOutstanding += outstandingBalance;
      }

      if (!visibility) {
        return;
      }

      if (!tenantId) {
        invoicesWithoutTenant.push(invoice);
        return;
      }

      if (visibility === "paid") {
        if (shouldReplacePaidInvoice(paidInvoiceByTenant.get(tenantId), invoice)) {
          paidInvoiceByTenant.set(tenantId, invoice);
        }
        return;
      }

      if (shouldReplaceNotPaidInvoice(notPaidInvoiceByTenant.get(tenantId), invoice)) {
        notPaidInvoiceByTenant.set(tenantId, invoice);
      }
    });

    const items = tenants.flatMap((tenant) => {
      const tenantId = String(tenant._id);
      const tenantItems = [];
      const notPaidInvoice = notPaidInvoiceByTenant.get(tenantId);
      const paidInvoice = paidInvoiceByTenant.get(tenantId);

      if (notPaidInvoice) {
        tenantItems.push(getPaymentStatusItem(tenant, notPaidInvoice, {
          referenceDate: today,
          dueCutoffDate: notPaidDueCutoffDate
        }));
      }

      if (paidInvoice) {
        tenantItems.push(getPaymentStatusItem(tenant, paidInvoice, {
          referenceDate: today,
          dueCutoffDate: nextMonthStart
        }));
      }

      return tenantItems;
    });

    invoicesWithoutTenant.forEach((invoice) => {
      items.push(getPaymentStatusItem(invoice.tenant, invoice, {
        referenceDate: today,
        dueCutoffDate: notPaidDueCutoffDate
      }));
    });

    const paid = items.filter((item) => item.status === "paid");
    const notPaid = items.filter((item) => item.status !== "paid");
    const paymentMatch = {
      paymentDate: {
        $gte: ethiopianMonthRange.start,
        $lt: ethiopianMonthRange.end
      },
      $or: [
        { invoice: { $exists: true, $ne: null } },
        { contract: { $exists: true, $ne: null } }
      ]
    };

    if (filter.building) {
      paymentMatch.building = filter.building;
    }

    const monthlyPaidResult = await PaymentRecord.aggregate([
      { $match: paymentMatch },
      {
        $lookup: {
          from: "invoices",
          localField: "invoice",
          foreignField: "_id",
          as: "invoiceDoc"
        }
      },
      {
        $lookup: {
          from: "contracts",
          localField: "contract",
          foreignField: "_id",
          as: "contractDoc"
        }
      },
      {
        $match: {
          $or: [
            {
              invoice: { $exists: true, $ne: null },
              "invoiceDoc.status": "paid"
            },
            {
              contract: { $exists: true, $ne: null },
              "contractDoc.status": "paid"
            }
          ]
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);
    const totalPaidAmount = monthlyPaidResult[0]?.total || 0;

    res.json({
      buildingId: req.query.building || null,
      generatedAt: new Date(),
      selectedPeriod: {
        ethiopianYear: ethiopianMonthRange.ethiopianYear,
        ethiopianMonth: ethiopianMonthRange.ethiopianMonth,
        start: ethiopianMonthRange.start,
        end: ethiopianMonthRange.end,
        isCurrentMonth: ethiopianMonthRange.isCurrentMonth
      },
      summary: {
        totalTenants: items.length,
        paid: paid.length,
        notPaid: notPaid.length,
        totalPaidAmount,
        totalPaidForSelectedMonth: totalPaidAmount,
        totalCollected: totalPaidAmount,
        totalPaidThisMonth: totalPaidAmount,
        paidThisMonthCount: monthlyPaidResult[0]?.count || 0,
        paidForSelectedMonthCount: monthlyPaidResult[0]?.count || 0,
        totalOutstanding
      },
      paid,
      notPaid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
      .populate('building')
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

    // invoiceDate chooses which billing period to generate; default is the current period.
    const invoiceDateObj = invoiceDate ? parseFlexibleDateInput(invoiceDate) : new Date();
    if (invoiceDate && !invoiceDateObj) {
      return res.status(400).json({ error: "Invalid invoice date" });
    }
    const period = await getNextInvoicePeriod(Invoice, contract, invoiceDateObj);

    if (!period?.periodStart || !period?.periodEnd) {
      return res.status(400).json({ error: "Contract has ended or has invalid lease dates" });
    }

    const { periodStart, periodEnd } = period;
    const dueDate = calculateDueDate(periodEnd);

    // Duplicate protection: one invoice per contract and billing period.
    const existingInvoice = await Invoice.findOne({
      tenant: tenantId,
      contract: contractId,
      periodStart: periodStart,
      periodEnd: periodEnd
    });

    if (existingInvoice) {
      return res.status(409).json({
        error: "Invoice already generated for this period",
        existingInvoice
      });
    }

    // New invoices always start pending. A paid previous period must not make the new period paid.
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
      ...getNewInvoicePaymentFields(contract.amount)
    });

    await syncPendingUtilitiesToInvoiceDueDate(invoice);
    await syncContractStatusFromInvoices(invoice.contract);

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
    const targetDateObj = targetDate ? parseFlexibleDateInput(targetDate) : new Date();
    if (targetDate && !targetDateObj) {
      return res.status(400).json({ error: "Invalid target date" });
    }

    if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ error: 'Invalid building id' });
    }

    const filter = buildingId ? { building: buildingId } : {};
    const contracts = await Contract.find(filter).populate('tenant');

    const generatedInvoices = [];
    const skippedInvoices = [];
    const errors = [];

    // Generate current-period invoices for all matching contracts and skip existing ones.
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

        // Skip existing periods instead of failing the whole auto-generate run.
        const existingInvoice = await Invoice.findOne({
          tenant: contract.tenant._id,
          contract: contract._id,
          periodStart: periodStart,
          periodEnd: periodEnd
        });

        if (existingInvoice) {
          skippedInvoices.push({
            contract: contract._id,
            tenant: contract.tenant._id,
            invoice: existingInvoice._id,
            reason: "already_generated"
          });
          continue;
        }

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
          ...getNewInvoicePaymentFields(contract.amount)
        });

        await syncPendingUtilitiesToInvoiceDueDate(invoice);
        await syncContractStatusFromInvoices(invoice.contract);

        generatedInvoices.push(invoice);
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
          generated: generatedInvoices.map((invoice) => String(invoice._id)),
          skipped: skippedInvoices
        }
      });
    }

    const message = `Generated ${generatedInvoices.length} invoice${generatedInvoices.length === 1 ? "" : "s"}` +
      (skippedInvoices.length ? `, skipped ${skippedInvoices.length} already generated` : "");

    res.json({
      message,
      generated: generatedInvoices.length,
      skipped: skippedInvoices.length,
      errors: errors.length,
      invoices: generatedInvoices,
      skippedInvoices
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

    // Manual reminder run uses the same service as the automatic background job.
    const result = await runDueDateReminders({
      daysAhead: req.body.daysAhead,
      sendSms: req.body.sendSms,
      sendEmail: req.body.sendEmail,
      force: req.body.force === true || req.body.force === "true" || req.query.force === "true",
      buildingId
    });

    await recordAuditLog({
      building: buildingId || undefined,
      action: "sent",
      entityType: "reminder",
      message: `${result.force ? "Manual force reminder run" : "Manual reminder run"} checked ${result.checked || 0}, sent ${result.sent || 0}, failed ${result.failed || 0}`,
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

    const paymentDateObj = paymentDate ? parsePaymentDateInput(paymentDate) : new Date();
    if (paymentDate && !paymentDateObj) {
      return res.status(400).json({ error: "Invalid payment date" });
    }
    // Payment can include a late penalty based on the invoice due date.
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
      receipt: normalizedReceipt,
      recordedBy: req.user?.id || undefined
    });

    // Update invoice balance after this payment; paid status depends on remaining balance.
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

    // Reminder history is stored on invoices, then flattened for the frontend table.
    const history = invoices.flatMap((invoice) =>
      (invoice.remindersSent || [])
        .filter((reminder) => !reminder.hiddenFromInvoiceManagement)
        .map((reminder) => ({
        reminderId: reminder._id,
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

router.delete('/invoices/:invoiceId/reminders/:reminderId', async (req, res) => {
  try {
    const { invoiceId, reminderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(invoiceId) || !mongoose.Types.ObjectId.isValid(reminderId)) {
      return res.status(400).json({ error: "Invalid reminder id" });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (req.query.building && String(invoice.building || "") !== String(req.query.building)) {
      return res.status(404).json({ error: "Reminder history not found" });
    }

    const reminder = invoice.remindersSent?.id(reminderId);
    if (!reminder || reminder.hiddenFromInvoiceManagement) {
      return res.status(404).json({ error: "Reminder history not found" });
    }

    reminder.hiddenFromInvoiceManagement = true;
    await invoice.save();

    await recordAuditLog({
      building: invoice.building,
      action: "hidden",
      entityType: "reminder_history",
      entityId: reminderId,
      entityLabel: invoice.invoiceNumber,
      message: `Reminder history row hidden for invoice ${getInvoiceLabel(invoice)}`,
      metadata: {
        invoice: invoice._id,
        type: reminder.type
      }
    });

    res.json({ message: "Reminder history row removed" });
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
    // Due list includes unpaid invoices from today through the configured look-ahead window.
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
      daysUntilDue: getDaysUntilDue(invoice.dueDate, today)
    }));

    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get overdue invoices
router.get('/invoices/overdue', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building id' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }
    // Overdue list includes unpaid invoices whose due date is before today.
    filter.status = 'pending';
    filter.dueDate = { $lt: today };

    const invoices = await Invoice.find(filter)
      .populate({
        path: 'tenant',
        populate: { path: 'unit', select: 'unitId' }
      })
      .populate('contract')
      .sort({ dueDate: 1 });

    const overdue = invoices.map(invoice => {
      const daysOverdue = Math.abs(getDaysUntilDue(invoice.dueDate, today));
      const latePenalty = calculateLatePenalty(invoice.dueDate, today, invoice.rentAmount);

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

    // Editing dates changes the invoice only. It does not send reminders by itself.
    let dueDateChanged = false;
    let remindersCleared = 0;
    if (dueDate) {
      const nextDueDate = parseFlexibleDateInput(dueDate);

      if (!nextDueDate) {
        return res.status(400).json({ error: "Invalid due date" });
      }

      // compare by milliseconds to avoid timezone/ISO-string edge cases
      const prevMs = invoice.dueDate ? new Date(invoice.dueDate).getTime() : null;
      const nextMs = new Date(nextDueDate).getTime();

      if (prevMs !== nextMs) {
        dueDateChanged = true;
        remindersCleared = clearReminderHistoryForScheduleChange(invoice);
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
    let totalAmountChanged = false;

    if (totalAmount !== undefined) {
      const normalizedTotal = Number(totalAmount);

      if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
        return res.status(400).json({ error: "Total amount must be greater than zero" });
      }

      invoice.rentAmount = normalizedTotal;
      invoice.totalAmount = normalizedTotal + (invoice.latePenalty || 0);
      invoice.outstandingBalance = Math.max(0, invoice.totalAmount - (invoice.amountPaid || 0));
      totalAmountChanged = true;

      if (invoice.status === "paid") {
        invoice.amountPaid = invoice.totalAmount;
        invoice.outstandingBalance = 0;
        invoice.paymentDate = invoice.paymentDate || new Date();
      }
    }

    const manualPaymentDate = status === "paid" && previousStatus !== "paid" ? new Date() : null;

    // Status changes use the shared helper so amountPaid/outstandingBalance stay consistent.
    if (status) {
      setInvoiceStatusFields(invoice, status, {
        paymentDate: manualPaymentDate,
        resetPaidAmount: previousStatus === "paid" && status === "pending"
      });
    }

    if (notes !== undefined) {
      invoice.notes = String(notes || '').trim();
    }

    await invoice.save();
    if (dueDateChanged) {
      await syncPendingUtilitiesToInvoiceDueDate(invoice);
    }
    const shouldClearPaymentRecords = status === "pending" && Number(invoice.amountPaid || 0) <= 0;
    const removedPaymentRecords = shouldClearPaymentRecords
      ? (await PaymentRecord.deleteMany({ invoice: invoice._id })).deletedCount || 0
      : 0;
    await syncContractStatusFromInvoices(invoice.contract);
    await invoice.populate('tenant');
    await invoice.populate('contract');

    const paymentRecordSync = invoice.status === "paid" && (status === "paid" || totalAmountChanged)
      ? await syncPaymentRecordForPaidEntity({
        building: invoice.building,
        tenant: invoice.tenant?._id || invoice.tenant,
        invoice: invoice._id,
        amount: invoice.amountPaid || invoice.totalAmount,
        paymentDate: manualPaymentDate || invoice.paymentDate || new Date(),
        notes: "Recorded from paid invoice status"
      })
      : { deletedCount: 0 };

    await recordAuditLog({
      building: invoice.building,
      action: "updated",
      entityType: "invoice",
      entityId: invoice._id,
      entityLabel: getInvoiceLabel(invoice),
      message: `Invoice ${getInvoiceLabel(invoice)} updated`,
      metadata: {
        dueDateChanged,
        remindersCleared,
        removedPaymentRecords: removedPaymentRecords + (paymentRecordSync.deletedCount || 0),
        previousStatus,
        status: invoice.status
      }
    });

    res.json({ message: "Invoice updated", invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invoice
router.delete('/invoices/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const paymentDelete = await PaymentRecord.deleteMany({ invoice: invoice._id });
    await Invoice.deleteOne({ _id: invoice._id });
    await syncContractStatusFromInvoices(invoice.contract);
    const utilitySync = await syncPendingUtilitiesToLatestTenantInvoiceDueDate({
      tenant: invoice.tenant,
      building: invoice.building,
      clearWhenMissing: true
    });

    await recordAuditLog({
      building: invoice.building,
      action: "deleted",
      entityType: "invoice",
      entityId: invoice._id,
      entityLabel: getInvoiceLabel(invoice),
      message: `Invoice ${getInvoiceLabel(invoice)} deleted`,
      metadata: {
        paymentRecordsDeleted: paymentDelete.deletedCount || 0,
        utilitiesUpdated: utilitySync.modifiedCount || 0
      }
    });

    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get payment records
router.get('/payment-records', async (req, res) => {
  try {
    const filter = { hiddenFromInvoiceManagement: { $ne: true } };
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
      .populate('building')
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

router.delete('/payment-records/:id', async (req, res) => {
  try {
    const paymentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ error: "Invalid payment record id" });
    }

    const payment = await PaymentRecord.findById(paymentId);
    if (!payment || payment.hiddenFromInvoiceManagement) {
      return res.status(404).json({ error: "Payment row not found" });
    }

    if (req.query.building && String(payment.building || "") !== String(req.query.building)) {
      return res.status(404).json({ error: "Payment row not found" });
    }

    payment.hiddenFromInvoiceManagement = true;
    await payment.save();

    await recordAuditLog({
      building: payment.building,
      action: "hidden",
      entityType: "payment_history",
      entityId: payment._id,
      entityLabel: payment.reference || String(payment._id),
      message: "Payment ledger row hidden from invoice management",
      metadata: {
        invoice: payment.invoice,
        contract: payment.contract,
        utility: payment.utility,
        amount: payment.amount
      }
    });

    res.json({ message: "Payment row removed from invoice management" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
