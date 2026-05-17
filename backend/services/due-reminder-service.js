const mongoose = require("mongoose");
const Invoice = require("../models/invoice-model");
const RentInvoice = require("../models/rent-invoice-model");
const {
  isEmailConfigured,
  isSmsConfigured,
  sendEmail,
  sendSMS
} = require("./messaging-service");
const { formatEthiopianDate } = require("../utils/date-utils");

const DAY_MS = 24 * 60 * 60 * 1000;
let reminderTimer;

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getStartOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getEndOfDay = (date) => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getInvoiceAmount = (invoice) =>
  invoice.outstandingBalance || invoice.totalAmount || invoice.rentAmount || 0;

const reminderAlreadySent = (invoice, type) =>
  (invoice.remindersSent || []).some((reminder) => reminder.type === type);

const buildDueDateMessage = (invoice, daysUntilDue) => {
  const tenantName = invoice.tenant?.tenantName || "Tenant";
  const dueDate = formatEthiopianDate(invoice.dueDate);
  const amount = getInvoiceAmount(invoice);
  const timing = daysUntilDue === 0
    ? "today"
    : `in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
  // English message (no invoice number)
  const en = `Hi ${tenantName}, your rent payment of Br ${amount} is due ${timing} (${dueDate}). Please complete payment by the due date.`;

  // Amharic message (no invoice number)
  // e.g. "ሰላም Amanuel፣ የኪራይ ክፍያዎ Br 1000 ነው። ክፍያው ዛሬ (16 May 2026) ይጠጋል። እባክዎ ክፍያዎን በቀን ውስጥ ያከናውኑ።"
  const am = `ሰላም ${tenantName}፣ የኪራይ ክፍያዎ Br ${amount} ነው። ክፍያው ${timing} (${dueDate}) ይጠጋል። እባክዎ ክፍያዎን በጊዜ ውስጥ ያከናውኑ።`;

  return `${en}\n${am}`;
};

const buildLatePaymentMessage = (invoice, daysOverdue) => {
  const tenantName = invoice.tenant?.tenantName || "Tenant";
  const dueDate = formatEthiopianDate(invoice.dueDate);
  const amount = getInvoiceAmount(invoice);
  // English message (no invoice number)
  const en = `Hi ${tenantName}, your rent payment of Br ${amount} was due on ${dueDate} and is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue. Please complete payment as soon as possible.`;

  // Amharic message
  const am = `ሰላም ${tenantName}፣ የኪራይ ክፍያዎ Br ${amount} ነው። ክፍያው ${dueDate} የተዘገየ ነው እና አሁን ${daysOverdue} ቀን(ዎች) በላይ አልፏል። እባክዎ በፍጥነት ክፍያዎን ያከናውኑ።`;

  return `${en}\n${am}`;
};

const getPendingInvoices = async (Model, daysAhead, buildingId) => {
  const today = getStartOfToday();
  const reminderEnd = getEndOfDay(new Date(today.getTime() + daysAhead * DAY_MS));
  const filter = {
    // include both pending and already-marked overdue invoices so late-payment
    // reminders are still sent if status was changed elsewhere
    status: { $in: ["pending", "overdue"] },
    dueDate: { $lte: reminderEnd }
  };

  if (buildingId && mongoose.Types.ObjectId.isValid(buildingId)) {
    filter.building = new mongoose.Types.ObjectId(buildingId);
  }

  return Model.find(filter)
    .populate("tenant")
    .populate("building")
    .sort({ dueDate: 1 });
};

const sendTenantReminder = async (invoice, type, message, options) => {
  const tenant = invoice.tenant;
  const errors = [];
  let sent = 0;

  if (!tenant) {
    return { sent, errors: ["Tenant record not found"] };
  }

  if (options.sendSms) {
    if (tenant.phone) {
      const smsResult = await sendSMS(tenant.phone, message);

      if (smsResult.success) {
        sent += 1;
      } else {
        errors.push(`SMS: ${smsResult.error}`);
      }
    } else {
      errors.push("SMS: tenant has no phone number");
    }
  }

  if (options.sendEmail) {
    if (tenant.email) {
      const subject = type === "late_payment"
        ? "Rent payment overdue"
        : "Rent payment due reminder";
      const emailResult = await sendEmail(tenant.email, subject, message);

      if (emailResult.success) {
        sent += 1;
      } else {
        errors.push(`Email: ${emailResult.error}`);
      }
    } else {
      errors.push("Email: tenant has no email address");
    }
  }

  return { sent, errors };
};

const processInvoices = async (Model, label, options) => {
  const invoices = await getPendingInvoices(Model, options.daysAhead, options.buildingId);
  const today = getStartOfToday();
  const results = {
    checked: invoices.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  for (const invoice of invoices) {
    const daysUntilDue = Math.ceil((invoice.dueDate - today) / DAY_MS);
    const isOverdue = daysUntilDue < 0;
    const reminderType = isOverdue ? "late_payment" : "due_date";

    if (reminderAlreadySent(invoice, reminderType)) {
      results.skipped += 1;
      continue;
    }

    const message = isOverdue
      ? buildLatePaymentMessage(invoice, Math.abs(daysUntilDue))
      : buildDueDateMessage(invoice, daysUntilDue);

    if (options.dryRun) {
      results.skipped += 1;
      continue;
    }

    const reminderResult = await sendTenantReminder(
      invoice,
      reminderType,
      message,
      options
    );

    if (reminderResult.sent > 0) {
      invoice.remindersSent = invoice.remindersSent || [];
      invoice.remindersSent.push({
        type: reminderType,
        sentAt: new Date(),
        message
      });
      await invoice.save();
      results.sent += 1;
    } else {
      results.failed += 1;
      results.errors.push({
        invoiceModel: label,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        tenant: invoice.tenant?._id,
        errors: reminderResult.errors
      });
    }
  }

  return results;
};

const mergeResults = (items) => items.reduce(
  (summary, item) => ({
    checked: summary.checked + item.checked,
    sent: summary.sent + item.sent,
    skipped: summary.skipped + item.skipped,
    failed: summary.failed + item.failed,
    errors: [...summary.errors, ...item.errors]
  }),
  { checked: 0, sent: 0, skipped: 0, failed: 0, errors: [] }
);

const runDueDateReminders = async (overrideOptions = {}) => {
  const options = {
    daysAhead: parseNumber(
      overrideOptions.daysAhead ?? process.env.DUE_REMINDER_DAYS_AHEAD,
      3
    ),
    dryRun: overrideOptions.dryRun === true,
    sendSms: overrideOptions.sendSms ?? process.env.DUE_REMINDER_SEND_SMS !== "false",
    sendEmail: overrideOptions.sendEmail ?? process.env.DUE_REMINDER_SEND_EMAIL === "true",
    buildingId: overrideOptions.buildingId || ""
  };

  if (!options.dryRun && options.sendSms && !isSmsConfigured()) {
    return {
      checked: 0,
      sent: 0,
      skipped: 0,
      failed: 1,
      errors: [{
        error: "SMS reminders are enabled, but SMS_API_URL, SMS_API_KEY, or SMS_SENDER_ID is missing."
      }]
    };
  }

  if (!options.dryRun && options.sendEmail && !isEmailConfigured()) {
    return {
      checked: 0,
      sent: 0,
      skipped: 0,
      failed: 1,
      errors: [{
        error: "Email reminders are enabled, but SMTP_USER or SMTP_PASS is missing."
      }]
    };
  }

  if (!options.sendSms && !options.sendEmail) {
    return {
      checked: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };
  }

  const results = await Promise.all([
    processInvoices(Invoice, "Invoice", options),
    processInvoices(RentInvoice, "RentInvoice", options)
  ]);

  return mergeResults(results);
};

const runReminderForInvoice = async (invoiceId, overrideOptions = {}) => {
  const options = {
    dryRun: overrideOptions.dryRun === true,
    sendSms: overrideOptions.sendSms ?? process.env.DUE_REMINDER_SEND_SMS !== "false",
    sendEmail: overrideOptions.sendEmail ?? process.env.DUE_REMINDER_SEND_EMAIL === "true",
    force: overrideOptions.force === true
  };

  const invoice = await Invoice.findById(invoiceId).populate('tenant').populate('building');
  if (!invoice) {
    return { checked: 0, sent: 0, skipped: 0, failed: 1, errors: [{ error: 'Invoice not found' }] };
  }

  const today = getStartOfToday();
  const daysUntilDue = Math.ceil((invoice.dueDate - today) / DAY_MS);
  const isOverdue = daysUntilDue < 0;
  const reminderType = isOverdue ? 'late_payment' : 'due_date';

  if (!options.force && reminderAlreadySent(invoice, reminderType)) {
    return { checked: 1, sent: 0, skipped: 1, failed: 0, errors: [] };
  }

  const message = isOverdue
    ? buildLatePaymentMessage(invoice, Math.abs(daysUntilDue))
    : buildDueDateMessage(invoice, daysUntilDue);

  if (options.dryRun) return { checked: 1, sent: 0, skipped: 1, failed: 0, errors: [] };

  const reminderResult = await sendTenantReminder(invoice, reminderType, message, options);

  if (reminderResult.sent > 0) {
    invoice.remindersSent = invoice.remindersSent || [];
    invoice.remindersSent.push({ type: reminderType, sentAt: new Date(), message });
    await invoice.save();
    return { checked: 1, sent: 1, skipped: 0, failed: 0, errors: [] };
  }

  return { checked: 1, sent: 0, skipped: 0, failed: 1, errors: reminderResult.errors };
};

const runRemindersForTenant = async (tenantId, overrideOptions = {}) => {
  const options = {
    dryRun: overrideOptions.dryRun === true,
    sendSms: overrideOptions.sendSms ?? process.env.DUE_REMINDER_SEND_SMS !== "false",
    sendEmail: overrideOptions.sendEmail ?? process.env.DUE_REMINDER_SEND_EMAIL === "true",
    force: overrideOptions.force === true
  };

  // find pending or overdue invoices for tenant
  const invoices = await Invoice.find({ tenant: tenantId, status: { $in: ['pending', 'overdue'] } })
    .populate('tenant')
    .populate('building')
    .sort({ dueDate: 1 });

  if (!invoices || invoices.length === 0) {
    return { checked: 0, sent: 0, skipped: 0, failed: 0, errors: [] };
  }

  const results = { checked: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  for (const inv of invoices) {
    const res = await runReminderForInvoice(inv._id, { ...options, force: options.force });
    results.checked += res.checked || 0;
    results.sent += res.sent || 0;
    results.skipped += res.skipped || 0;
    results.failed += res.failed || 0;
    if (res.errors && res.errors.length) results.errors.push(...res.errors);
  }

  return results;
};

const startDueDateReminderJob = () => {
  if (process.env.DUE_REMINDER_ENABLED === "false") {
    console.log("Due date reminder job is disabled");
    return null;
  }

  if (reminderTimer) {
    return reminderTimer;
  }

  const intervalMinutes = parseNumber(process.env.DUE_REMINDER_INTERVAL_MINUTES, 1440);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  const runJob = async () => {
    try {
      const result = await runDueDateReminders();

      if (result.sent > 0 || result.failed > 0) {
        console.log("Due date reminder job result:", result);
      }
    } catch (error) {
      console.error("Due date reminder job failed:", error);
    }
  };

  setTimeout(runJob, 15000);
  reminderTimer = setInterval(runJob, intervalMs);
  console.log(`Due date reminder job started. Interval: ${intervalMinutes} minute(s).`);

  return reminderTimer;
};

module.exports = {
  runDueDateReminders,
  startDueDateReminderJob
};

// Additional admin helpers
module.exports.runReminderForInvoice = runReminderForInvoice;
module.exports.runRemindersForTenant = runRemindersForTenant;
