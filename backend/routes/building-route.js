const express = require("express");
const router = express.Router();

const Building = require("../models/building-model");
const Floor = require("../models/floor-model");
const Unit = require("../models/unit-model");
const Tenant = require("../models/tenant-model");
const Employee = require("../models/employees-model");
const Contract = require("../models/contract-model");
const Invoice = require("../models/invoice-model");
const PaymentRecord = require("../models/payment-record-model");
const Utility = require("../models/utility-model");
const { recordAuditLog } = require("../services/audit-log-service");
const {
  ETHIOPIAN_PHONE_ERROR,
  normalizeEthiopianPhone
} = require("../utils/phone-utils");

// Building routes are the parent layer for almost every record in the system.
// Most child tables store a building id, so delete/update logic here must protect related data.

router.get("/buildings", async (req, res) => {
  try {
    const buildings = await Building.find().sort({ createdAt: 1, name: 1 });
    res.json(buildings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/buildings", async (req, res) => {
  try {
    const { name, address, managerName, phone, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Building name is required" });
    }

    // Normalize optional phone numbers once so stored data has a predictable format.
    let normalizedPhone;
    try {
      normalizedPhone = normalizeEthiopianPhone(phone, { required: false });
    } catch {
      return res.status(400).json({ error: ETHIOPIAN_PHONE_ERROR });
    }

    const building = await Building.create({
      name,
      address,
      managerName,
      phone: normalizedPhone,
      notes
    });

    await recordAuditLog({
      building: building._id,
      action: "created",
      entityType: "building",
      entityId: building._id,
      entityLabel: building.name,
      message: `Building ${building.name} created`
    });

    res.status(201).json({ message: "Building added successfully", building });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/buildings/:id", async (req, res) => {
  try {
    const { name, address, managerName, phone, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Building name is required" });
    }

    let normalizedPhone;

    try {
      normalizedPhone = normalizeEthiopianPhone(phone, { required: false });
    } catch {
      return res.status(400).json({ error: ETHIOPIAN_PHONE_ERROR });
    }

    const building = await Building.findByIdAndUpdate(
      req.params.id,
      { name, address, managerName, phone: normalizedPhone, notes },
      { returnDocument: "after" }
    );

    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    await recordAuditLog({
      building: building._id,
      action: "updated",
      entityType: "building",
      entityId: building._id,
      entityLabel: building.name,
      message: `Building ${building.name} updated`
    });

    res.json({ message: "Building updated successfully", building });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/buildings/:id", async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);

    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    // Count every child collection before deleting. This protects users from
    // accidentally removing an entire building with tenants, invoices, or payments.
    const relatedCounts = {
      floors: await Floor.countDocuments({ building: req.params.id }),
      units: await Unit.countDocuments({ building: req.params.id }),
      tenants: await Tenant.countDocuments({ building: req.params.id }),
      employees: await Employee.countDocuments({ building: req.params.id }),
      contracts: await Contract.countDocuments({ building: req.params.id }),
      utilities: await Utility.countDocuments({ building: req.params.id }),
      invoices: await Invoice.countDocuments({ building: req.params.id }),
      payments: await PaymentRecord.countDocuments({ building: req.params.id })
    };

    const hasRelatedData = Object.values(relatedCounts).some((count) => count > 0);

    if (hasRelatedData && req.query.force !== "true") {
      return res.status(400).json({
        error: "Cannot delete this building while it still has related data. Remove the related records first.",
        relatedCounts
      });
    }

    // Force delete is intentionally explicit because it cascades through all building-owned data.
    await Promise.all([
      Floor.deleteMany({ building: req.params.id }),
      Unit.deleteMany({ building: req.params.id }),
      Tenant.deleteMany({ building: req.params.id }),
      Employee.deleteMany({ building: req.params.id }),
      Contract.deleteMany({ building: req.params.id }),
      Utility.deleteMany({ building: req.params.id }),
      Invoice.deleteMany({ building: req.params.id }),
      PaymentRecord.deleteMany({ building: req.params.id })
    ]);

    await Building.findByIdAndDelete(req.params.id);
    await recordAuditLog({
      building: building._id,
      action: "deleted",
      entityType: "building",
      entityId: building._id,
      entityLabel: building.name,
      message: `Building ${building.name} deleted`
    });

    res.json({ message: "Building and its data deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
