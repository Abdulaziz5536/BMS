const express = require("express");
const router = express.Router();

const Utility = require("../models/utility-model");
const Tenant = require("../models/tenant-model");
const PaymentRecord = require("../models/payment-record-model");
const { recordAuditLog } = require("../services/audit-log-service");
const { createPaymentRecordIfMissing } = require("../services/payment-record-service");
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput,
  toIsoDate
} = require("../utils/date-utils");

const getBuildingFilter = (building) => (building ? { building } : {});

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

const calculateNextDueDate = (dueDate, paymentFrequency) => {
  const base = parseDueDate(dueDate);
  if (!base) return null;

  const next = new Date(base);

  // Payment frequency determines the next utility bill created after a payment.
  switch ((paymentFrequency || "").toLowerCase()) {
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "every 6 months":
      next.setMonth(next.getMonth() + 6);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
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
      notes,
      utilityFile
    } = req.body;

    if (!building || !tenant) {
      return res.status(400).json({ error: "Building and tenant are required" });
    }

    if (!validateUtilityAmounts(waterAmount, lightAmount, generatorGasAmount)) {
      return res.status(400).json({ error: "Utility amounts cannot be negative" });
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

    const normalizedDueDate = normalizeDateOnlyString(dueDate);

    const utility = await Utility.create({
      building,
      tenant,
      waterAmount: Number(waterAmount) || 0,
      lightAmount: Number(lightAmount) || 0,
      generatorGasAmount: Number(generatorGasAmount) || 0,
      dueDate: normalizedDueDate,
      paymentFrequency: paymentFrequency || undefined,
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
      notes,
      utilityFile
    } = req.body;

    if (!building || !tenant) {
      return res.status(400).json({ error: "Building and tenant are required" });
    }

    if (!validateUtilityAmounts(waterAmount, lightAmount, generatorGasAmount)) {
      return res.status(400).json({ error: "Utility amounts cannot be negative" });
    }

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

    const normalizedDueDate = normalizeDateOnlyString(dueDate);

    const previousUtility = await Utility.findById(req.params.id);

    if (!previousUtility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    const utility = await Utility.findByIdAndUpdate(
      req.params.id,
      {
        building,
        tenant,
        waterAmount: Number(waterAmount) || 0,
        lightAmount: Number(lightAmount) || 0,
        generatorGasAmount: Number(generatorGasAmount) || 0,
        dueDate: normalizedDueDate,
        paymentFrequency: paymentFrequency || undefined,
        status: status || "pending",
        notes,
        utilityFile: normalizedUtilityFile
      },
      { returnDocument: "after" }
    );

    await recordAuditLog({
      building: utility.building,
      action: "updated",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: "Utility payment updated"
    });

    if (previousUtility.status !== "paid" && utility.status === "paid") {
      await createPaymentRecordIfMissing({
        building: utility.building,
        tenant: utility.tenant,
        utility: utility._id,
        amount: getUtilityTotal(utility),
        notes: "Recorded from paid utility status"
      });
    }

    res.json({ message: "Utility payment updated", utility });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/utilities/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["pending", "paid"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const utility = await Utility.findById(req.params.id);

    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    const previousStatus = utility.status;
    utility.status = status;
    await utility.save();

    if (previousStatus !== "paid" && status === "paid") {
      await createPaymentRecordIfMissing({
        building: utility.building,
        tenant: utility.tenant,
        utility: utility._id,
        amount: getUtilityTotal(utility),
        notes: "Recorded from paid utility status"
      });
    }

    await recordAuditLog({
      building: utility.building,
      action: "status_changed",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: `Utility status changed to ${status}`
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
    const utility = await Utility.findById(req.params.id);
    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    if (utility.status === "paid") {
      return res.status(400).json({ error: "Utility payment is already paid" });
    }

    // Mark the current bill paid, create a payment record, then open the next pending cycle.
    utility.status = "paid";
    await utility.save();

    const paymentRecord = await PaymentRecord.create({
      building: utility.building,
      tenant: utility.tenant,
      utility: utility._id,
      paymentDate: new Date(),
      amount: getUtilityTotal(utility),
      paymentMethod: "cash",
      notes: "Recorded from utility payment action"
    });

    // Create the next pending utility using the same amounts and frequency.
    const nextDueDate = calculateNextDueDate(utility.dueDate, utility.paymentFrequency);

    const nextUtility = await Utility.create({
      building: utility.building,
      tenant: utility.tenant,
      waterAmount: utility.waterAmount,
      lightAmount: utility.lightAmount,
      generatorGasAmount: utility.generatorGasAmount,
      dueDate: nextDueDate || "",
      paymentFrequency: utility.paymentFrequency || "Monthly",
      status: "pending",
      notes: utility.notes,
      // copy attachment into next record
      utilityFile: utility.utilityFile
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
    const paymentCount = await PaymentRecord.countDocuments({ utility: req.params.id });

    if (paymentCount > 0) {
      return res.status(400).json({
        error: "Cannot delete this utility payment because payment records use it."
      });
    }

    const utility = await Utility.findByIdAndDelete(req.params.id);
    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    await recordAuditLog({
      building: utility.building,
      action: "deleted",
      entityType: "utility",
      entityId: utility._id,
      entityLabel: String(getUtilityTotal(utility)),
      message: "Utility payment deleted"
    });

    res.json({ message: "Utility payment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
