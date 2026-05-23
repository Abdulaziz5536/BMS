const express = require("express");
const router = express.Router();

const Utility = require("../models/utility-model");
const Tenant = require("../models/tenant-model");
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput,
  toIsoDate
} = require("../utils/date-utils");

const getBuildingFilter = (building) => (building ? { building } : {});

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

    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
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

    const utility = await Utility.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: "after" }
    );

    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

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

    // 1) mark current as paid
    utility.status = "paid";
    await utility.save();

    // 2) create next pending utility
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
    const utility = await Utility.findByIdAndDelete(req.params.id);
    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    res.json({ message: "Utility payment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
