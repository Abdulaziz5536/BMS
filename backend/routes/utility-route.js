const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Utility = require("../models/utility-model");
const Tenant = require("../models/tenant-model");
const PaymentRecord = require("../models/payment-record-model");
const { recordAuditLog } = require("../services/audit-log-service");
const {
  createPaymentRecordIfMissing,
  syncPaymentRecordForPaidEntity
} = require("../services/payment-record-service");
const { ensureRecordMatchesRequestedBuilding } = require("../utils/building-scope-utils");
const {
  getSyncedUtilityDueDate
} = require("../services/utility-invoice-sync-service");
const {
  runUtilityDueDateReminders
} = require("../services/due-reminder-service");
const {
  parsePaymentDateInput,
  parseFlexibleDateInput,
  toIsoDate
} = require("../utils/date-utils");
const {
  CUSTOM_PAYMENT_FREQUENCY,
  getFrequencyMonths,
  normalizePaymentFrequency
} = require("../utils/payment-frequency-utils");
const { isPaymentDateTooFarInFuture } = require("../utils/payment-date-utils");

const getBuildingFilter = (building) => (building ? { building } : {});
const PAYMENT_METHODS = new Set(["cash", "bank_transfer", "check", "mobile_money", "other"]);
const DAY_MS = 24 * 60 * 60 * 1000;

// Utility payments are separate from rent invoices but follow the same pattern:
// validate tenant/building ownership, track paid/pending state, and record payments.

const populateUtilityTenant = {
  path: "tenant",
  populate: {
    path: "unit",
    populate: {
      path: "floor"
    }
  }
};

const parseDueDate = (dueDate) => {
  if (!dueDate) return null;
  return parseFlexibleDateInput(dueDate);
};

const getStartOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDaysUntilDue = (dueDate, referenceDate = new Date()) => {
  const dueDay = getStartOfDay(dueDate);
  const referenceDay = getStartOfDay(referenceDate);

  if (Number.isNaN(dueDay.getTime()) || Number.isNaN(referenceDay.getTime())) {
    return 0;
  }

  return Math.round((dueDay.getTime() - referenceDay.getTime()) / DAY_MS);
};

const calculateNextDueDate = (dueDate, paymentFrequency) => {
  const base = parseDueDate(dueDate);
  if (!base) return null;

  const next = new Date(base);

  // Payment frequency determines the next utility bill created after a payment.
  if (String(paymentFrequency || "").trim().toLowerCase() === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + getFrequencyMonths(paymentFrequency));
  }

  return toIsoDate(next);
};

const MAX_FILE_DATA_LENGTH = 7000000;

const normalizeUtilityFile = (file) => {
  if (!file) return undefined;

  // Files are stored as base64 data from the frontend, so keep a size limit before saving.
  if (file && file.name && file.type && file.data && typeof file.data === "string") {
    if (file.data.length > MAX_FILE_DATA_LENGTH) return null;
    return {
      name: file.name,
      type: file.type,
      data: file.data
    };
  }

  return null;
};

const getUtilityTotal = (utility) =>
  (Number(utility.waterAmount) || 0) +
  (Number(utility.lightAmount) || 0) +
  (Number(utility.generatorGasAmount) || 0);

const validateUtilityAmounts = (waterAmount, lightAmount, generatorGasAmount) => {
  const amounts = [waterAmount, lightAmount, generatorGasAmount].map((value) => Number(value) || 0);
  return amounts.every((amount) => amount >= 0);
};

const getPaymentDateFromRequest = (paymentDate) => {
  if (!paymentDate) return new Date();
  return parsePaymentDateInput(paymentDate);
};

const isTruthyOption = (value) => value === true || value === "true";

const isAllowedPaymentDate = (req, paymentDate) =>
  isTruthyOption(req.body?.allowFuturePayment) || !isPaymentDateTooFarInFuture(paymentDate);

const getPaymentMethodFromRequest = (paymentMethod) => {
  const method = paymentMethod || "cash";
  return PAYMENT_METHODS.has(method) ? method : null;
};

const getUtilityAlertItem = (utility, referenceDate) => {
  const dueDate = parseDueDate(utility.dueDate);
  const daysUntilDue = getDaysUntilDue(dueDate, referenceDate);

  return {
    utilityId: utility._id,
    tenantId: utility.tenant?._id || null,
    tenantName: utility.tenant?.tenantName || "Tenant",
    tenantPhone: utility.tenant?.phone || "",
    tenantEmail: utility.tenant?.email || "",
    tenantUnit: utility.tenant?.unit?.unitId || "",
    waterAmount: Number(utility.waterAmount) || 0,
    lightAmount: Number(utility.lightAmount) || 0,
    generatorGasAmount: Number(utility.generatorGasAmount) || 0,
    amount: getUtilityTotal(utility),
    dueDate,
    daysUntilDue,
    daysOverdue: Math.abs(daysUntilDue)
  };
};

router.get("/utilities", async (req, res) => {
  try {
    const utilities = await Utility.find(getBuildingFilter(req.query.building))
      .populate(populateUtilityTenant)
      .sort({ createdAt: -1 });

    res.json(utilities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/utilities/alerts", async (req, res) => {
  try {
    const today = getStartOfDay();
    const dueSoonEnd = new Date(today);
    dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);
    dueSoonEnd.setHours(23, 59, 59, 999);

    const utilities = await Utility.find({
      ...getBuildingFilter(req.query.building),
      status: "pending"
    })
      .populate(populateUtilityTenant)
      .sort({ dueDate: 1, createdAt: 1 });

    const dueSoon = [];
    const overdue = [];

    utilities.forEach((utility) => {
      const dueDate = parseDueDate(utility.dueDate);
      if (!dueDate) {
        return;
      }

      const alertItem = getUtilityAlertItem(utility, today);

      if (dueDate < today) {
        overdue.push(alertItem);
        return;
      }

      if (dueDate <= dueSoonEnd) {
        dueSoon.push(alertItem);
      }
    });

    res.json({ dueSoon, overdue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/utilities/reminders/send", async (req, res) => {
  try {
    const buildingId = req.body.building || req.query.building || "";

    if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    const result = await runUtilityDueDateReminders({
      daysAhead: req.body.daysAhead ?? req.query.daysAhead,
      sendSms: req.body.sendSms,
      sendEmail: req.body.sendEmail,
      force: req.body.force === true || req.body.force === "true" || req.query.force === "true",
      buildingId
    });

    await recordAuditLog({
      building: buildingId || undefined,
      action: "sent",
      entityType: "reminder",
      message: `${result.force ? "Manual force utility reminder run" : "Manual utility reminder run"} checked ${result.checked || 0}, sent ${result.sent || 0}, failed ${result.failed || 0}`,
      metadata: result
    });

    const statusCode = result.failed > 0 && result.sent === 0 ? 400 : 200;

    res.status(statusCode).json({
      message: `Sent ${result.sent} utility reminder${result.sent === 1 ? "" : "s"}`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/utilities", async (req, res) => {
  try {
    const {
      building,
      tenant,
      waterAmount,
      lightAmount,
      generatorGasAmount,
      dueDate,
      paymentFrequency,
      status,
      paymentDate,
      paymentMethod,
      notes,
      utilityFile
    } = req.body;

    if (!building || !tenant) {
      return res.status(400).json({ error: "Building and tenant are required" });
    }

    if (!validateUtilityAmounts(waterAmount, lightAmount, generatorGasAmount)) {
      return res.status(400).json({ error: "Utility amounts cannot be negative" });
    }

    const normalizedPaymentFrequency = normalizePaymentFrequency(paymentFrequency || "Monthly");

    if (!normalizedPaymentFrequency || normalizedPaymentFrequency === CUSTOM_PAYMENT_FREQUENCY) {
      return res.status(400).json({ error: "Enter a valid payment frequency" });
    }

    // Never allow a utility bill to reference a tenant from another building.
    const tenantRecord = await Tenant.findOne({ _id: tenant, building });
    if (!tenantRecord) {
      return res.status(400).json({ error: "Tenant does not belong to this building" });
    }

    const normalizedUtilityFile = normalizeUtilityFile(utilityFile);
    if (normalizedUtilityFile === null) {
      return res.status(400).json({ error: "Uploaded file is invalid or too large" });
    }

    if (dueDate && !parseFlexibleDateInput(dueDate)) {
      return res.status(400).json({ error: "Invalid due date" });
    }

    const paymentDateObj = status === "paid" ? getPaymentDateFromRequest(paymentDate) : null;
    if (status === "paid" && !paymentDateObj) {
      return res.status(400).json({ error: "Invalid payment date" });
    }

    if (status === "paid" && !isAllowedPaymentDate(req, paymentDateObj)) {
      return res.status(400).json({ error: "Payment date is too far in the future" });
    }

    if (status === "paid" && getUtilityTotal({ waterAmount, lightAmount, generatorGasAmount }) <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than zero" });
    }

    const normalizedPaymentMethod = status === "paid" ? getPaymentMethodFromRequest(paymentMethod) : null;
    if (status === "paid" && !normalizedPaymentMethod) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    const normalizedDueDate = await getSyncedUtilityDueDate({
      tenant,
      building,
      fallbackDueDate: dueDate
    });

    const utility = await Utility.create({
      building,
      tenant,
      waterAmount: Number(waterAmount) || 0,
      lightAmount: Number(lightAmount) || 0,
      generatorGasAmount: Number(generatorGasAmount) || 0,
      dueDate: normalizedDueDate,
      paymentFrequency: normalizedPaymentFrequency,
      status: status || "pending",
      notes,
      utilityFile: normalizedUtilityFile
    });

    await recordAuditLog({
      building: utility.building,
      action: "created",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: "Utility payment created"
    });

    if (utility.status === "paid") {
      await createPaymentRecordIfMissing({
        building: utility.building,
        tenant: utility.tenant,
        utility: utility._id,
        amount: getUtilityTotal(utility),
        paymentDate: paymentDateObj,
        paymentMethod: normalizedPaymentMethod,
        notes: "Recorded from paid utility status"
      });
    }

    res.status(201).json({ message: "Utility payment added", utility });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/utilities/:id", async (req, res) => {
  try {
    const {
      building,
      tenant,
      waterAmount,
      lightAmount,
      generatorGasAmount,
      dueDate,
      paymentFrequency,
      status,
      paymentDate,
      paymentMethod,
      notes,
      utilityFile
    } = req.body;

    if (!building || !tenant) {
      return res.status(400).json({ error: "Building and tenant are required" });
    }

    if (!validateUtilityAmounts(waterAmount, lightAmount, generatorGasAmount)) {
      return res.status(400).json({ error: "Utility amounts cannot be negative" });
    }

    const normalizedPaymentFrequency = normalizePaymentFrequency(paymentFrequency || "Monthly");

    if (!normalizedPaymentFrequency || normalizedPaymentFrequency === CUSTOM_PAYMENT_FREQUENCY) {
      return res.status(400).json({ error: "Enter a valid payment frequency" });
    }

    const tenantRecord = await Tenant.findOne({ _id: tenant, building });
    if (!tenantRecord) {
      return res.status(400).json({ error: "Tenant does not belong to this building" });
    }

    const normalizedUtilityFile = normalizeUtilityFile(utilityFile);
    if (normalizedUtilityFile === null) {
      return res.status(400).json({ error: "Uploaded file is invalid or too large" });
    }

    const parsedDueDate = dueDate ? parseFlexibleDateInput(dueDate) : null;
    if (dueDate && !parsedDueDate) {
      return res.status(400).json({ error: "Invalid due date" });
    }

    const previousUtility = await Utility.findById(req.params.id);

    if (!previousUtility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, previousUtility, "Utility payment")) {
      return;
    }

    const normalizedDueDate = dueDate !== undefined
      ? (parsedDueDate ? toIsoDate(parsedDueDate) : "")
      : await getSyncedUtilityDueDate({
        tenant,
        building,
        fallbackDueDate: dueDate
      });

    const recordsNewPayment = previousUtility.status !== "paid" && status === "paid";
    const paymentDateObj = recordsNewPayment ? getPaymentDateFromRequest(paymentDate) : null;
    if (recordsNewPayment && !paymentDateObj) {
      return res.status(400).json({ error: "Invalid payment date" });
    }

    if (recordsNewPayment && !isAllowedPaymentDate(req, paymentDateObj)) {
      return res.status(400).json({ error: "Payment date is too far in the future" });
    }

    const normalizedPaymentMethod = recordsNewPayment ? getPaymentMethodFromRequest(paymentMethod) : null;
    if (recordsNewPayment && !normalizedPaymentMethod) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    if (recordsNewPayment && getUtilityTotal({ waterAmount, lightAmount, generatorGasAmount }) <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than zero" });
    }

    const updatePayload = {
      building,
      tenant,
      waterAmount: Number(waterAmount) || 0,
      lightAmount: Number(lightAmount) || 0,
      generatorGasAmount: Number(generatorGasAmount) || 0,
      dueDate: normalizedDueDate,
      paymentFrequency: normalizedPaymentFrequency,
      status: status || "pending",
      notes,
      utilityFile: normalizedUtilityFile
    };

    if (String(previousUtility.dueDate || "") !== String(normalizedDueDate || "")) {
      updatePayload.remindersSent = [];
    }

    const clearsRecordedPayment = previousUtility.status === "paid" && updatePayload.status !== "paid";

    const utility = await Utility.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { returnDocument: "after" }
    );

    const removedPaymentRecords = clearsRecordedPayment
      ? (await PaymentRecord.deleteMany({ utility: previousUtility._id })).deletedCount || 0
      : 0;
    const paymentRecordSync = utility.status === "paid"
      ? await syncPaymentRecordForPaidEntity({
        building: utility.building,
        tenant: utility.tenant,
        utility: utility._id,
        amount: getUtilityTotal(utility),
        paymentDate: recordsNewPayment ? paymentDateObj : undefined,
        paymentMethod: recordsNewPayment ? normalizedPaymentMethod : undefined,
        notes: "Recorded from paid utility status"
      })
      : { deletedCount: 0 };

    await recordAuditLog({
      building: utility.building,
      action: "updated",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: "Utility payment updated",
      metadata: {
        paymentRecordsDeleted: removedPaymentRecords + (paymentRecordSync.deletedCount || 0)
      }
    });

    res.json({ message: "Utility payment updated", utility });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/utilities/:id/status", async (req, res) => {
  try {
    const { status, paymentDate, paymentMethod } = req.body;

    if (!status || !["pending", "paid"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const utility = await Utility.findById(req.params.id);

    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, utility, "Utility payment")) {
      return;
    }

    const previousStatus = utility.status;
    const recordsNewPayment = previousStatus !== "paid" && status === "paid";
    const clearsRecordedPayment = previousStatus === "paid" && status !== "paid";

    const paymentDateObj = recordsNewPayment ? getPaymentDateFromRequest(paymentDate) : null;
    if (recordsNewPayment && !paymentDateObj) {
      return res.status(400).json({ error: "Invalid payment date" });
    }

    if (recordsNewPayment && !isAllowedPaymentDate(req, paymentDateObj)) {
      return res.status(400).json({ error: "Payment date is too far in the future" });
    }

    if (recordsNewPayment && getUtilityTotal(utility) <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than zero" });
    }

    const normalizedPaymentMethod = recordsNewPayment ? getPaymentMethodFromRequest(paymentMethod) : null;
    if (recordsNewPayment && !normalizedPaymentMethod) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    utility.status = status;
    await utility.save();

    const removedPaymentRecords = clearsRecordedPayment
      ? (await PaymentRecord.deleteMany({ utility: utility._id })).deletedCount || 0
      : 0;
    const paymentRecordSync = utility.status === "paid"
      ? await syncPaymentRecordForPaidEntity({
        building: utility.building,
        tenant: utility.tenant,
        utility: utility._id,
        amount: getUtilityTotal(utility),
        paymentDate: recordsNewPayment ? paymentDateObj : undefined,
        paymentMethod: recordsNewPayment ? normalizedPaymentMethod : undefined,
        notes: "Recorded from paid utility status"
      })
      : { deletedCount: 0 };

    await recordAuditLog({
      building: utility.building,
      action: "status_changed",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: `Utility status changed to ${status}`,
      metadata: {
        paymentRecordsDeleted: removedPaymentRecords + (paymentRecordSync.deletedCount || 0)
      }
    });

    return res.json({
      message: "Utility status updated",
      utility
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch("/utilities/:id/pay", async (req, res) => {
  try {
    const { paymentDate, paymentMethod, notes, utilityFile } = req.body;
    const utility = await Utility.findById(req.params.id);
    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, utility, "Utility payment")) {
      return;
    }

    if (utility.status === "paid") {
      return res.status(400).json({ error: "Utility payment is already paid" });
    }

    const paymentDateObj = getPaymentDateFromRequest(paymentDate);
    if (!paymentDateObj) {
      return res.status(400).json({ error: "Invalid payment date" });
    }

    if (!isAllowedPaymentDate(req, paymentDateObj)) {
      return res.status(400).json({ error: "Payment date is too far in the future" });
    }

    if (getUtilityTotal(utility) <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than zero" });
    }

    const normalizedPaymentMethod = getPaymentMethodFromRequest(paymentMethod);
    if (!normalizedPaymentMethod) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    const normalizedUtilityFile = normalizeUtilityFile(utilityFile);
    if (normalizedUtilityFile === null) {
      return res.status(400).json({ error: "Uploaded file is invalid or too large" });
    }

    // Mark the current bill paid, create a payment record, then open the next pending cycle.
    utility.status = "paid";
    if (normalizedUtilityFile !== undefined) {
      utility.utilityFile = normalizedUtilityFile;
    }
    await utility.save();

    const paymentRecord = await PaymentRecord.create({
      building: utility.building,
      tenant: utility.tenant,
      utility: utility._id,
      paymentDate: paymentDateObj,
      amount: getUtilityTotal(utility),
      paymentMethod: normalizedPaymentMethod,
      notes: notes || "Recorded from utility payment action"
    });

    // Create the next pending utility using the same amounts and frequency.
    const nextDueDate = await getSyncedUtilityDueDate({
      tenant: utility.tenant,
      building: utility.building,
      fallbackDueDate: calculateNextDueDate(utility.dueDate, utility.paymentFrequency),
      afterDate: utility.dueDate
    });

    const nextUtility = await Utility.create({
      building: utility.building,
      tenant: utility.tenant,
      waterAmount: utility.waterAmount,
      lightAmount: utility.lightAmount,
      generatorGasAmount: utility.generatorGasAmount,
      dueDate: nextDueDate || "",
      paymentFrequency: normalizePaymentFrequency(utility.paymentFrequency || "Monthly"),
      status: "pending",
      notes: utility.notes
    });

    await recordAuditLog({
      building: utility.building,
      action: "recorded",
      entityType: "payment",
      entityId: paymentRecord._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: `Utility payment of Br ${getUtilityTotal(utility)} recorded and next utility created`,
      metadata: {
        utility: utility._id,
        nextUtility: nextUtility._id
      }
    });

    return res.json({
      message: "Utility payment marked as paid and next utility created",
      utility,
      nextUtility
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/utilities/:id", async (req, res) => {
  try {
    const utility = await Utility.findById(req.params.id);
    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, utility, "Utility payment")) {
      return;
    }

    const paymentDelete = await PaymentRecord.deleteMany({ utility: utility._id });
    await Utility.deleteOne({ _id: utility._id });

    await recordAuditLog({
      building: utility.building,
      action: "deleted",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: "Utility payment deleted",
      metadata: {
        paymentRecordsDeleted: paymentDelete.deletedCount || 0
      }
    });

    res.json({ message: "Utility payment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
