const mongoose = require("mongoose");
const Invoice = require("../models/invoice-model");
const RentInvoice = require("../models/rent-invoice-model");
const {
  isEmailConfigured,
  isSmsConfigured,
  sendEmail,
  sendSMS
} = require("./messaging-service");
const { recordAuditLog } = require("./audit-log-service");
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

const getReminderText = (message) => {
  if (typeof message === "string") {
    return message;
  }

  return message?.text || "";
};

const getSmsText = (message) => {
  if (typeof message === "string") {
    return message;
  }

  return message?.sms || getReminderText(message);
};

const buildEmailHtml = ({
  title,
  greeting,
  summary,
  amharic,
  details,
  preheader = "",
  extraTitle = "Important notice",
  extraLines = [],
  accentColor = "#2563eb",
  headerColor = "#0f4c81"
}) => {
  const importantNotes = extraLines.filter(Boolean);

  return `
    <div style="background: #f3f6fb; padding: 28px 14px; font-family: Arial, sans-serif; color: #1f2937;">
      ${preheader ? `
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
          ${preheader}
        </div>
      ` : ''}
      <div style="max-width: 660px; margin: auto; background: #ffffff; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden;">
        <div style="background: ${headerColor}; color: #ffffff; padding: 24px 28px;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; letter-spacing: 1px;">BHA MALL</p>
          <h1 style="margin: 0; font-size: 24px; font-weight: 700;">${title}</h1>
        </div>

        <div style="padding: 26px 28px;">
          <p style="font-size: 16px; margin: 0 0 18px;">${greeting}</p>

          <div style="background: #f8fbff; border-left: 4px solid ${accentColor}; padding: 16px 18px; margin-bottom: 22px;">
            <p style="margin: 0; font-size: 15px; line-height: 1.65;">${summary}</p>
            ${amharic ? `<p style="margin: 16px 0 0; font-size: 15px; line-height: 1.65;">${amharic}</p>` : ''}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 14px;">
            ${details.map((item) => `
              <tr>
                <td style="padding: 11px 0; color: #64748b; width: 145px; vertical-align: top; border-bottom: 1px solid #edf2f7;">${item.label}</td>
                <td style="padding: 11px 0; color: #111827; border-bottom: 1px solid #edf2f7;">${item.value}</td>
              </tr>
            `).join('')}
          </table>

          ${importantNotes.length > 0 ? `
            <div style="background: #fff8ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 16px 18px; margin-bottom: 22px;">
              <p style="margin: 0 0 12px; color: #9a3412; font-size: 13px; font-weight: 700;">${extraTitle}</p>
              ${importantNotes.map((line, index) => `
                <p style="margin: ${index === 0 ? "0" : "12px"} 0 0; color: ${index < 2 ? "#374151" : "#64748b"}; font-size: 14px; line-height: 1.65;">${line}</p>
              `).join('')}
            </div>
          ` : ''}

          <p style="margin: 0; font-size: 14px; color: #475569;">Thank you for your attention.</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #475569;">ስለ ትኩረትዎ እናመሰግናለን።</p>
        </div>

        <div style="background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; padding: 15px 20px;">
          This is an automated reminder from BHA MALL.
        </div>
      </div>
    </div>
  `;
};

const buildDueDateMessage = (invoice, daysUntilDue) => {
  const tenantName = invoice.tenant?.tenantName || "Tenant";
  const dueDate = formatEthiopianDate(invoice.dueDate);
  const amount = getInvoiceAmount(invoice);
  const timing = daysUntilDue === 0
    ? "today"
    : `in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
  const timingAmharic = daysUntilDue === 0
    ? "ዛሬ"
    : `${daysUntilDue} ቀን ውስጥ`;
  const dueNote = "Please make payment before the due date to avoid any penalties.";
  const dueNoteAmharic = "እባክዎ ተጨማሪ ቅጣት እንዳይኖር ክፍያዎን ከመክፈያ ቀኑ በፊት ያጠናቁ።";
  const paidNote = "If you have already paid, please ignore this message.";
  const paidNoteAmharic = "ክፍያዎን አስቀድመው ከፈጸሙ እባክዎ ይህን መልዕክት ችላ ይበሉ።";

  const en = `Hi ${tenantName}, your rent payment of Br ${amount} is due ${timing} (${dueDate}). Please complete payment by the due date.`;
  const am = `ሰላም ${tenantName}፣ የኪራይ ክፍያዎ ${amount} ብር ነው። ክፍያው ${timingAmharic}(ቀን/ቀናት ውስጥ) (${dueDate}) ነው። እባክዎ ክፍያዎን በጊዜ ውስጥ ያከናውኑ።`;

  const text = `${en}
${am}

${dueNote}
${dueNoteAmharic}

${paidNote}
${paidNoteAmharic}`;
  const sms = text;
  const html = buildEmailHtml({
    title: "Rent Payment Reminder",
    greeting: `Hello ${tenantName},`,
    summary: `Your rent payment of Br ${amount} is due ${timing} on ${dueDate}.`,
    preheader: `${dueNote} ${paidNote}`,
    amharic: `የኪራይ ክፍያዎ ${amount} ብር ነው። ክፍያው በ ${timingAmharic} (${dueDate}) ነው።`,
    details: [
      { label: "Amount", value: `Br ${amount}` },
      { label: "Due date", value: dueDate },
      { label: "Reminder", value: daysUntilDue === 0 ? "Due today" : `Due ${timing}` }
    ],
    extraTitle: "Payment notice",
    extraLines: [
      dueNote,
      dueNoteAmharic,
      paidNote,
      paidNoteAmharic
    ]
  });

  return { text, html, sms };
};

const buildLatePaymentMessage = (invoice, daysOverdue) => {
  const tenantName = invoice.tenant?.tenantName || "Tenant";
  const dueDate = formatEthiopianDate(invoice.dueDate);
  const amount = getInvoiceAmount(invoice);
  const overdueTiming = `${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`;
  const overdueTimingAmharic = `${daysOverdue} ቀን`;
  const overdueNote = "Please settle your outstanding balance immediately to avoid further penalties.";
  const overdueNoteAmharic = "ተጨማሪ ቅጣት እንዳይጨመር እባክዎ ያለብዎትን ቀሪ ክፍያ በአስቸኳይ ይፈጽሙ።";
  const helpNote = "If you have already paid or need help with your payment plan, please contact the office.";
  const helpNoteAmharic = "ክፍያዎን አስቀድመው ከፈጸሙ ወይም በክፍያ ዕቅድዎ ላይ እርዳታ ካስፈለገዎት እባክዎ ቢሮውን ያነጋግሩ።";

  const en = `Hi ${tenantName}, your rent payment of Br ${amount} was due on ${dueDate} and is now ${overdueTiming} overdue. Please complete payment as soon as possible.`;
  const am = `ሰላም ${tenantName}፣ የኪራይ ክፍያዎ Br ${amount} ነው። ክፍያው ${dueDate} የተዘገየ ነው እና አሁን ${overdueTimingAmharic} በላይ አልፏል። እባክዎ በፍጥነት ክፍያዎን ያከናውኑ።`;

  const text = `${en}
${am}

${overdueNote}
${overdueNoteAmharic}

${helpNote}
${helpNoteAmharic}`;
  const sms = text;
  const html = buildEmailHtml({
    title: "Overdue Rent Notice",
    greeting: `Hello ${tenantName},`,
    summary: `Your rent payment of Br ${amount} was due on ${dueDate} and is now ${overdueTiming} overdue.`,
    preheader: `${overdueNote} ${helpNote}`,
    amharic: `የኪራይ ክፍያዎ ${amount} ብር ነው። ክፍያው በ ${dueDate} የተዘገየ ነው እና አሁን ከ ${overdueTimingAmharic} በላይ ነው።`,
    details: [
      { label: "Amount", value: `Br ${amount}` },
      { label: "Due date", value: dueDate },
      { label: "Days overdue", value: overdueTiming }
    ],
    extraTitle: "Overdue notice",
    extraLines: [
      overdueNote,
      overdueNoteAmharic,
      helpNote,
      helpNoteAmharic
    ],
    accentColor: "#dc2626",
    headerColor: "#7f1d1d"
  });

  return { text, html, sms };
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
      const smsResult = await sendSMS(tenant.phone, getSmsText(message));

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
      const emailResult = await sendEmail(
        tenant.email,
        subject,
        getReminderText(message),
        message.html
      );

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
        message: getReminderText(message)
      });
      await invoice.save();
      await recordAuditLog({
        building: invoice.building?._id || invoice.building,
        action: "sent",
        entityType: "reminder",
        entityId: invoice._id,
        entityLabel: invoice.invoiceNumber,
        message: `${reminderType === "late_payment" ? "Overdue" : "Due-date"} reminder sent for invoice ${invoice.invoiceNumber}`,
        metadata: {
          invoiceModel: label,
          type: reminderType,
          channels: {
            email: options.sendEmail,
            sms: options.sendSms
          }
        }
      });
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
    sendSms: overrideOptions.sendSms !== undefined
      ? overrideOptions.sendSms
      : process.env.DUE_REMINDER_SEND_SMS !== undefined
        ? process.env.DUE_REMINDER_SEND_SMS === "true"
        : false,
    sendEmail: overrideOptions.sendEmail !== undefined
      ? overrideOptions.sendEmail
      : process.env.DUE_REMINDER_SEND_EMAIL !== undefined
        ? process.env.DUE_REMINDER_SEND_EMAIL === "true"
        : isEmailConfigured(),
    buildingId: overrideOptions.buildingId || ""
  };

  if (options.sendSms && !isSmsConfigured()) {
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

  if (options.sendEmail && !isEmailConfigured()) {
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

const summarizeReminderError = (entry) => {
  if (typeof entry === "string") {
    return entry;
  }

  const invoice = entry.invoiceNumber || entry.invoiceId;
  const errors = Array.isArray(entry.errors) ? entry.errors.join("; ") : entry.error;

  return [entry.invoiceModel, invoice, errors].filter(Boolean).join(": ");
};

const summarizeReminderResult = (result) => ({
  checked: result.checked,
  sent: result.sent,
  skipped: result.skipped,
  failed: result.failed,
  errors: (result.errors || []).slice(0, 3).map(summarizeReminderError),
  moreErrors: Math.max(0, (result.errors || []).length - 3)
});

const startDueDateReminderJob = () => {
  if (process.env.DUE_REMINDER_ENABLED !== "true") {
    console.log("Due date reminder job is disabled. Set DUE_REMINDER_ENABLED=true to enable it.");
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
        console.log("Due date reminder job result:", summarizeReminderResult(result));
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
