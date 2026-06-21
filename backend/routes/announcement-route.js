const express = require("express");
const mongoose = require("mongoose");

const Announcement = require("../models/announcement-model");
const Tenant = require("../models/tenant-model");
const Unit = require("../models/unit-model");
const {
  createHttpError,
  isEmailConfigured,
  isSmsConfigured,
  sendEmail,
  sendSMS
} = require("../services/messaging-service");
const { ensureRecordMatchesRequestedBuilding } = require("../utils/building-scope-utils");
const { getBuildingBrandName } = require("../utils/branding-utils");
const { parseFlexibleDateInput } = require("../utils/date-utils");

const router = express.Router();

// Announcements can target all tenants, selected floors/units, or named tenants.
// Delivery uses the selected building for branding, email account, and SMS sender ID.

const toBoolean = (value) => value === true || value === "true";

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

const textToHtml = (value = "") =>
  escapeHtml(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin: 0 0 14px; line-height: 1.7;">${line}</p>`)
    .join("");

const announcementTypeLabels = {
  announcement: "Announcement",
  emergency: "Emergency Alert",
  rent_reminder: "Rent Reminder"
};

const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};

const getAnnouncementTheme = (announcement) => {
  // Email colors change by importance so emergency and rent notices stand out.
  if (announcement.type === "emergency" || announcement.priority === "urgent") {
    return {
      accentColor: "#dc2626",
      headerColor: "#7f1d1d",
      panelColor: "#fff1f2",
      panelBorder: "#fecdd3"
    };
  }

  if (announcement.type === "rent_reminder") {
    return {
      accentColor: "#ca8a04",
      headerColor: "#854d0e",
      panelColor: "#fffbeb",
      panelBorder: "#fde68a"
    };
  }

  return {
    accentColor: "#2563eb",
    headerColor: "#0f4c81",
    panelColor: "#f8fbff",
    panelBorder: "#bfdbfe"
  };
};

const buildAnnouncementEmailText = (announcement, tenant) => {
  const tenantName = tenant?.tenantName || "Tenant";
  const brandName = getBuildingBrandName(announcement.building);

  return [
    brandName,
    "",
    `Hello ${tenantName},`,
    "",
    announcement.title,
    "",
    announcement.message,
    "",
    `Type: ${announcementTypeLabels[announcement.type] || "Announcement"}`,
    `Priority: ${priorityLabels[announcement.priority] || announcement.priority || "Medium"}`,
    "",
    "Thank you for your attention."
  ].join("\n");
};

const buildAnnouncementSmsText = (announcement) =>
  `${getBuildingBrandName(announcement.building)}: ${announcement.message}`;

const buildAnnouncementEmailHtml = (announcement, tenant) => {
  const tenantName = tenant?.tenantName || "Tenant";
  const brandName = getBuildingBrandName(announcement.building);
  const typeLabel = announcementTypeLabels[announcement.type] || "Announcement";
  const priorityLabel = priorityLabels[announcement.priority] || announcement.priority || "Medium";
  const theme = getAnnouncementTheme(announcement);
  const preheader = `${typeLabel}: ${announcement.title}`;

  // HTML is built here instead of the frontend because the backend sends the email.
  return `
    <div style="background: #f3f6fb; padding: 28px 14px; font-family: Arial, sans-serif; color: #1f2937;">
      <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
        ${escapeHtml(preheader)}
      </div>

      <div style="max-width: 680px; margin: auto; background: #ffffff; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden;">
        <div style="background: ${theme.headerColor}; color: #ffffff; padding: 24px 28px;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; letter-spacing: 1px;">${escapeHtml(brandName)}</p>
          <h1 style="margin: 0; font-size: 24px; font-weight: 700;">${escapeHtml(announcement.title)}</h1>
        </div>

        <div style="padding: 26px 28px;">
          <p style="font-size: 16px; margin: 0 0 18px;">Hello ${escapeHtml(tenantName)},</p>

          <div style="background: ${theme.panelColor}; border: 1px solid ${theme.panelBorder}; border-left: 4px solid ${theme.accentColor}; border-radius: 10px; padding: 16px 18px; margin-bottom: 22px;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: ${theme.headerColor};">${escapeHtml(typeLabel)}</p>
            <p style="margin: 8px 0 0; font-size: 14px; color: #475569;">Priority: ${escapeHtml(priorityLabel)}</p>
          </div>

          <div style="font-size: 15px; color: #111827; margin-bottom: 24px;">
            ${textToHtml(announcement.message)}
          </div>

          <p style="margin: 0; font-size: 14px; color: #475569;">Thank you for your attention.</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #475569;">${escapeHtml(brandName)}</p>
        </div>

        <div style="background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; padding: 15px 20px;">
          This announcement was sent by ${escapeHtml(brandName)}.
        </div>
      </div>
    </div>
  `;
};

const validateObjectId = (id, label) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, `Invalid ${label}: ${id}`);
  }
};

const validateObjectIds = (ids, label) => {
  ids.forEach((id) => validateObjectId(id, label));
};

const getBuildingId = (building) => building?._id || building;

const buildRecipientFilter = (building) => {
  const buildingId = getBuildingId(building);

  return buildingId ? { building: buildingId } : {};
};

const uniqueTenants = (tenants) => {
  const seen = new Set();

  return tenants.filter((tenant) => {
    const key = String(tenant._id);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getRecipients = async (announcement) => {
  const { targetType, targetIds = [], tenantIds = [], building } = announcement;
  const buildingFilter = buildRecipientFilter(building);
  let recipients = [];

  // Resolve the chosen audience into tenant records that have email/phone fields.
  switch (targetType) {
    case "all_tenants":
      recipients = await Tenant.find(buildingFilter).populate("unit");
      break;

    case "selected_floors": {
      const units = await Unit.find({
        ...buildingFilter,
        floor: { $in: targetIds }
      }).select("_id");

      recipients = await Tenant.find({
        ...buildingFilter,
        unit: { $in: units.map((unit) => unit._id) }
      }).populate("unit");
      break;
    }

    case "selected_units":
      recipients = await Tenant.find({
        ...buildingFilter,
        unit: { $in: targetIds }
      }).populate("unit");
      break;

    case "specific_tenants":
      recipients = await Tenant.find({
        ...buildingFilter,
        _id: { $in: tenantIds }
      }).populate("unit");
      break;

    default:
      recipients = [];
  }

  return uniqueTenants(recipients);
};

const normalizeAnnouncementPayload = (body) => {
  const scheduledFor = body.scheduledFor || body.scheduledDate || "";
  const normalizedScheduledFor = scheduledFor ? parseFlexibleDateInput(scheduledFor) : undefined;
  const type = body.type || "announcement";

  if (scheduledFor && !normalizedScheduledFor) {
    throw createHttpError(400, "Invalid scheduled date");
  }

  // Keep draft/scheduled/sending/sent state consistent from the first save.
  return {
    title: String(body.title || "").trim(),
    message: String(body.message || "").trim(),
    type,
    priority: body.priority || (type === "emergency" ? "urgent" : "medium"),
    targetType: body.targetType,
    targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
    targetModel: body.targetModel,
    tenantIds: Array.isArray(body.tenantIds) ? body.tenantIds : [],
    building: body.building,
    sentBy: body.sentBy || null,
    sendSMS: toBoolean(body.sendSMS),
    sendEmail: toBoolean(body.sendEmail),
    scheduledFor: normalizedScheduledFor,
    status: normalizedScheduledFor ? "scheduled" : "draft",
    notes: String(body.notes || "").trim()
  };
};

const validateAnnouncementPayload = (announcementData) => {
  if (!announcementData.title) {
    throw createHttpError(400, "Title is required");
  }

  if (!announcementData.message) {
    throw createHttpError(400, "Message is required");
  }

  if (!announcementData.building) {
    throw createHttpError(400, "Building is required");
  }

  validateObjectId(announcementData.building, "building ID");

  if (!announcementData.sendEmail && !announcementData.sendSMS) {
    throw createHttpError(400, "Select at least one delivery method");
  }

  // Selected floors/units need ObjectIds so Mongo queries cannot accidentally match bad data.
  if (
    announcementData.targetType === "selected_floors" ||
    announcementData.targetType === "selected_units"
  ) {
    if (announcementData.targetIds.length === 0) {
      throw createHttpError(400, "Target IDs are required for the selected audience");
    }

    validateObjectIds(announcementData.targetIds, "target ID");
  }

  if (announcementData.targetType === "selected_floors") {
    announcementData.targetModel = "Floor";
  }

  if (announcementData.targetType === "selected_units") {
    announcementData.targetModel = "Unit";
  }

  if (announcementData.targetType === "specific_tenants") {
    if (announcementData.tenantIds.length === 0) {
      throw createHttpError(400, "Tenant IDs are required for specific tenants");
    }

    validateObjectIds(announcementData.tenantIds, "tenant ID");
  }
};

const updateDeliveryStatus = (announcement, delivery) => {
  // Store a channel-by-channel delivery summary for the announcement history page.
  announcement.deliveryStatus = {
    sms: {
      sent: delivery.smsSent,
      failed: delivery.smsFailed,
      total: delivery.smsSent + delivery.smsFailed
    },
    email: {
      sent: delivery.emailSent,
      failed: delivery.emailFailed,
      total: delivery.emailSent + delivery.emailFailed
    }
  };

  const totalSent = delivery.smsSent + delivery.emailSent;
  announcement.status = totalSent > 0 ? "sent" : "failed";

  if (totalSent > 0) {
    announcement.sentAt = new Date();
  }
};

router.post("/", async (req, res) => {
  try {
    const announcementData = normalizeAnnouncementPayload(req.body);
    validateAnnouncementPayload(announcementData);

    const announcement = await Announcement.create(announcementData);
    await announcement.populate("building");

    res.status(201).json({
      message: "Announcement created successfully",
      announcement
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const filter = {};

    if (req.query.building) {
      validateObjectId(req.query.building, "building ID");
      filter.building = req.query.building;
    }

    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    const announcements = await Announcement.find(filter)
      .populate("building")
      .populate("sentBy", "name email")
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/stats/summary", async (req, res) => {
  try {
    const filter = {};

    if (req.query.building) {
      validateObjectId(req.query.building, "building ID");
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }

    const stats = await Announcement.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
          scheduled: { $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          emergency: { $sum: { $cond: [{ $eq: ["$type", "emergency"] }, 1, 0] } },
          announcements: { $sum: { $cond: [{ $eq: ["$type", "announcement"] }, 1, 0] } },
          reminders: { $sum: { $cond: [{ $eq: ["$type", "rent_reminder"] }, 1, 0] } }
        }
      }
    ]);

    res.json(stats[0] || {
      total: 0,
      sent: 0,
      scheduled: 0,
      draft: 0,
      failed: 0,
      emergency: 0,
      announcements: 0,
      reminders: 0
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/:id/send", async (req, res) => {
  let announcement;

  try {
    validateObjectId(req.params.id, "announcement ID");

    announcement = await Announcement.findById(req.params.id).populate("building");

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, announcement, "Announcement")) {
      return;
    }

    if (announcement.status === "sent") {
      return res.status(400).json({ error: "Announcement already sent" });
    }

    if (!announcement.sendEmail && !announcement.sendSMS) {
      return res.status(400).json({ error: "No delivery method selected" });
    }

    if (announcement.sendEmail && !isEmailConfigured(announcement.building)) {
      return res.status(400).json({
        error: "Email is not configured. Set SMTP_USER and SMTP_PASS in backend/.env."
      });
    }

    if (announcement.sendSMS && !isSmsConfigured(announcement.building)) {
      return res.status(400).json({
        error: "SMS is not configured for this building. Set SMS_API_URL, SMS_API_KEY, and SMS_<BUILDING>_SENDER_ID in backend/.env."
      });
    }

    // Recipients are resolved at send time so edits to tenants/floors are respected.
    const recipients = await getRecipients(announcement);

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients found for this announcement" });
    }

    announcement.status = "sending";
    await announcement.save();

    const delivery = {
      smsSent: 0,
      smsFailed: 0,
      emailSent: 0,
      emailFailed: 0
    };
    const smsErrors = [];
    const emailErrors = [];
    const subjectPrefix = {
      emergency: "EMERGENCY ALERT",
      rent_reminder: "Rent Reminder",
      announcement: "Announcement"
    }[announcement.type] || "Announcement";
    const brandName = getBuildingBrandName(announcement.building);

    // Send to each tenant and collect per-channel failures instead of stopping at the first error.
    for (const tenant of recipients) {
      const subject = `${brandName} - ${subjectPrefix}: ${announcement.title}`;

      if (announcement.sendSMS) {
        if (tenant.phone) {
          const smsResult = await sendSMS(
            tenant.phone,
            buildAnnouncementSmsText(announcement),
            { building: announcement.building }
          );

          if (smsResult.success) {
            delivery.smsSent += 1;
          } else {
            delivery.smsFailed += 1;
            smsErrors.push({
              tenant: tenant._id,
              phone: tenant.phone,
              error: smsResult.error
            });
          }
        } else {
          delivery.smsFailed += 1;
          smsErrors.push({ tenant: tenant._id, error: "No phone number available" });
        }
      }

      if (announcement.sendEmail) {
        const email = String(tenant.email || "").trim();

        if (email) {
          const emailText = buildAnnouncementEmailText(announcement, tenant);
          const emailHtml = buildAnnouncementEmailHtml(announcement, tenant);
          const emailResult = await sendEmail(email, subject, emailText, emailHtml, {
            building: announcement.building
          });

          if (emailResult.success) {
            delivery.emailSent += 1;
          } else {
            delivery.emailFailed += 1;
            emailErrors.push({
              tenant: tenant._id,
              email,
              error: emailResult.error
            });
          }
        } else {
          delivery.emailFailed += 1;
          emailErrors.push({ tenant: tenant._id, error: "No email address available" });
        }
      }
    }

    updateDeliveryStatus(announcement, delivery);
    await announcement.save();

    const totalSent = delivery.smsSent + delivery.emailSent;

    res.json({
      message: totalSent > 0 ? "Announcement sent successfully" : "Announcement failed to send",
      announcement,
      delivery: {
        sms: { sent: delivery.smsSent, failed: delivery.smsFailed },
        email: { sent: delivery.emailSent, failed: delivery.emailFailed }
      },
      errors: {
        sms: smsErrors,
        email: emailErrors
      }
    });
  } catch (error) {
    if (announcement) {
      announcement.status = "failed";
      await announcement.save().catch(() => {});
    }

    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    validateObjectId(req.params.id, "announcement ID");

    const announcement = await Announcement.findById(req.params.id)
      .populate("building")
      .populate("sentBy", "name email")
      .populate("targetIds")
      .populate("tenantIds", "tenantName phone email");

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, announcement, "Announcement")) {
      return;
    }

    res.json(announcement);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

const updateAnnouncement = async (req, res) => {
  try {
    validateObjectId(req.params.id, "announcement ID");

    const update = { ...req.body };
    const existingAnnouncement = await Announcement.findById(req.params.id);

    if (!existingAnnouncement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, existingAnnouncement, "Announcement")) {
      return;
    }

    if (update.scheduledDate && !update.scheduledFor) {
      update.scheduledFor = update.scheduledDate;
      delete update.scheduledDate;
    }

    if (update.scheduledFor) {
      const scheduledFor = parseFlexibleDateInput(update.scheduledFor);
      if (!scheduledFor) {
        throw createHttpError(400, "Invalid scheduled date");
      }
      update.scheduledFor = scheduledFor;
    }

    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      update,
      { returnDocument: "after", runValidators: true }
    ).populate("building").populate("sentBy", "name email");

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    res.json({ message: "Announcement updated", announcement });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

router.put("/:id", updateAnnouncement);
router.patch("/:id", updateAnnouncement);

router.delete("/:id", async (req, res) => {
  try {
    validateObjectId(req.params.id, "announcement ID");

    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, announcement, "Announcement")) {
      return;
    }

    await Announcement.deleteOne({ _id: announcement._id });

    res.json({ message: "Announcement deleted successfully" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
