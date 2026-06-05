const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Maintenance = require("../models/maintenance-model");
const Tenant = require("../models/tenant-model");
const Unit = require("../models/unit-model");
const Floor = require("../models/floor-model");
const Employee = require("../models/employees-model");
const { recordAuditLog } = require("../services/audit-log-service");

const VALID_CATEGORIES = new Set([
  "plumbing",
  "electric",
  "electrical",
  "water",
  "hvac",
  "appliance",
  "furniture",
  "pest",
  "cleaning",
  "security",
  "general",
  "other"
]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const VALID_STATUSES = new Set(["pending", "approved", "in_progress", "completed", "cancelled"]);
const MAX_IMAGES = 5;
const MAX_FILE_DATA_LENGTH = 7000000;

const maintenancePopulate = [
  {
    path: "tenant",
    populate: {
      path: "unit",
      populate: {
        path: "floor"
      }
    }
  },
  {
    path: "unit",
    populate: {
      path: "floor"
    }
  },
  {
    path: "floor"
  },
  {
    path: "assignedTo"
  }
];

const getId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
};

const normalizeObjectId = (value) => {
  const id = getId(value).trim();

  if (!id) return undefined;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return id;
};

const normalizeString = (value) => String(value || "").trim();

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalizeDate = (value) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeImages = (images) => {
  if (images === undefined) {
    return undefined;
  }

  if (!Array.isArray(images) || images.length > MAX_IMAGES) {
    return null;
  }

  return images.map((image) => {
    if (
      !image ||
      !image.name ||
      !image.type ||
      !String(image.type).startsWith("image/") ||
      !image.data ||
      typeof image.data !== "string" ||
      image.data.length > MAX_FILE_DATA_LENGTH
    ) {
      return null;
    }

    return {
      name: String(image.name),
      type: String(image.type),
      data: image.data,
      size: Number(image.size) || undefined
    };
  });
};

const serializeMaintenance = (maintenance, { includeImages = true } = {}) => {
  const item = maintenance.toObject ? maintenance.toObject() : maintenance;
  const images = item.images?.length ? item.images : item.attachments || [];

  return {
    ...item,
    status: item.status === "open" ? "pending" : item.status,
    requestId: item.requestId || `REQ-${String(item._id).slice(-6).toUpperCase()}`,
    images: includeImages ? images : [],
    attachments: includeImages ? item.attachments || [] : [],
    imageCount: images.length
  };
};

const populateMaintenance = (query) => query.populate(maintenancePopulate);

const hasBodyField = (body, field) =>
  Object.prototype.hasOwnProperty.call(body, field);

const getPayloadValue = (body, existingMaintenance, field) =>
  hasBodyField(body, field) ? body[field] : existingMaintenance?.[field];

const buildMaintenancePayload = async (body, existingMaintenance = null) => {
  const building = normalizeObjectId(getPayloadValue(body, existingMaintenance, "building"));
  const tenant = normalizeObjectId(getPayloadValue(body, existingMaintenance, "tenant"));
  const requestedUnit = normalizeObjectId(getPayloadValue(body, existingMaintenance, "unit"));
  const floor = normalizeObjectId(getPayloadValue(body, existingMaintenance, "floor"));
  const assignedTo = normalizeObjectId(getPayloadValue(body, existingMaintenance, "assignedTo"));
  const title = normalizeString(getPayloadValue(body, existingMaintenance, "title"));
  const description = normalizeString(getPayloadValue(body, existingMaintenance, "description"));
  const category = normalizeString(
    getPayloadValue(body, existingMaintenance, "category") || "plumbing"
  );
  const priority = normalizeString(
    getPayloadValue(body, existingMaintenance, "priority") || "medium"
  );
  const status = normalizeString(
    getPayloadValue(body, existingMaintenance, "status") || "pending"
  );
  const scheduledDate = normalizeDate(
    getPayloadValue(body, existingMaintenance, "scheduledDate")
  );
  const estimatedCost = normalizeNumber(
    body.estimatedCost ?? existingMaintenance?.estimatedCost ?? 0
  );
  const actualCost = normalizeNumber(
    body.actualCost ?? existingMaintenance?.actualCost ?? 0
  );
  const images = normalizeImages(body.images);

  if (!building || (!tenant && !floor) || !title || !description) {
    return { error: "Building, location, title, and description are required" };
  }

  if ([building, tenant, requestedUnit, floor, assignedTo].includes(null)) {
    return { error: "Invalid maintenance reference" };
  }

  if (!VALID_CATEGORIES.has(category)) {
    return { error: "Invalid maintenance category" };
  }

  if (!VALID_PRIORITIES.has(priority)) {
    return { error: "Invalid maintenance priority" };
  }

  if (!VALID_STATUSES.has(status)) {
    return { error: "Invalid maintenance status" };
  }

  if (scheduledDate === null) {
    return { error: "Invalid scheduled date" };
  }

  if (estimatedCost === null || actualCost === null) {
    return { error: "Costs cannot be negative" };
  }

  if (images === null || images?.includes(null)) {
    return { error: "Uploaded images are invalid or too large" };
  }

  let unit = requestedUnit;

  if (tenant) {
    const tenantRecord = await Tenant.findOne({ _id: tenant, building });

    if (!tenantRecord) {
      return { error: "Tenant does not belong to this building" };
    }

    unit = requestedUnit || getId(tenantRecord.unit);
  } else {
    unit = undefined;
  }

  if (unit) {
    const unitRecord = await Unit.findOne({ _id: unit, building });

    if (!unitRecord) {
      return { error: "Unit does not belong to this building" };
    }
  }

  if (floor) {
    const floorRecord = await Floor.findOne({ _id: floor, building });

    if (!floorRecord) {
      return { error: "Floor does not belong to this building" };
    }
  }

  if (assignedTo) {
    const employeeRecord = await Employee.findOne({ _id: assignedTo, building });

    if (!employeeRecord) {
      return { error: "Assigned employee does not belong to this building" };
    }
  }

  const payload = {
    building,
    requestId: normalizeString(getPayloadValue(body, existingMaintenance, "requestId")) || `REQ-${Date.now()}`,
    tenant: tenant || null,
    unit: unit || null,
    floor: floor || null,
    category,
    priority,
    title,
    description,
    status,
    assignedTo: assignedTo || null,
    scheduledDate,
    estimatedCost,
    actualCost,
    notes: normalizeString(getPayloadValue(body, existingMaintenance, "notes")),
    resolution: normalizeString(getPayloadValue(body, existingMaintenance, "resolution")),
    completedDate: status === "completed" ? new Date() : null
  };

  if (images !== undefined) {
    payload.images = images;
  }

  return { payload };
};

router.get("/maintenance", async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    const maintenance = await populateMaintenance(
      Maintenance.find(filter).sort({ createdAt: -1 })
    );

    res.json(maintenance.map((item) => serializeMaintenance(item, { includeImages: false })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/maintenance/:id", async (req, res) => {
  try {
    const maintenance = await populateMaintenance(Maintenance.findById(req.params.id));

    if (!maintenance) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }

    res.json({ maintenance: serializeMaintenance(maintenance) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/maintenance", async (req, res) => {
  try {
    const { error, payload } = await buildMaintenancePayload(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const maintenance = await Maintenance.create(payload);
    const populatedMaintenance = await populateMaintenance(
      Maintenance.findById(maintenance._id)
    );

    await recordAuditLog({
      building: maintenance.building,
      action: "created",
      entityType: "maintenance",
      entityId: maintenance._id,
      entityLabel: maintenance.requestId,
      message: `Maintenance request ${maintenance.requestId} created`
    });

    res.status(201).json({
      message: "Maintenance request submitted",
      maintenance: serializeMaintenance(populatedMaintenance)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/maintenance/:id", async (req, res) => {
  try {
    const existingMaintenance = await Maintenance.findById(req.params.id);

    if (!existingMaintenance) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }

    const { error, payload } = await buildMaintenancePayload(req.body, existingMaintenance);

    if (error) {
      return res.status(400).json({ error });
    }

    const maintenance = await populateMaintenance(
      Maintenance.findByIdAndUpdate(req.params.id, payload, {
        returnDocument: "after",
        runValidators: true
      })
    );

    await recordAuditLog({
      building: maintenance.building,
      action: "updated",
      entityType: "maintenance",
      entityId: maintenance._id,
      entityLabel: maintenance.requestId,
      message: `Maintenance request ${maintenance.requestId} updated`
    });

    res.json({
      message: "Maintenance request updated",
      maintenance: serializeMaintenance(maintenance)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/maintenance/:id/status", async (req, res) => {
  try {
    const status = normalizeString(req.body.status);
    const hasActualCost = Object.prototype.hasOwnProperty.call(req.body, "actualCost");
    const actualCost = hasActualCost ? normalizeNumber(req.body.actualCost) : undefined;

    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid maintenance status" });
    }

    if (actualCost === null) {
      return res.status(400).json({ error: "Actual cost cannot be negative" });
    }

    const maintenance = await Maintenance.findById(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }

    maintenance.status = status;
    maintenance.completedDate = status === "completed" ? new Date() : null;
    if (hasActualCost) {
      maintenance.actualCost = actualCost;
    }
    await maintenance.save();

    const populatedMaintenance = await populateMaintenance(
      Maintenance.findById(maintenance._id)
    );

    await recordAuditLog({
      building: maintenance.building,
      action: "status_changed",
      entityType: "maintenance",
      entityId: maintenance._id,
      entityLabel: maintenance.requestId,
      message: `Maintenance request ${maintenance.requestId} marked ${status}`
    });

    res.json({
      message: "Maintenance status updated",
      maintenance: serializeMaintenance(populatedMaintenance)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/maintenance/:id/cost", async (req, res) => {
  try {
    const actualCost = normalizeNumber(req.body.actualCost);

    if (actualCost === null) {
      return res.status(400).json({ error: "Actual cost cannot be negative" });
    }

    const maintenance = await Maintenance.findById(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }

    maintenance.actualCost = actualCost;
    await maintenance.save();

    const populatedMaintenance = await populateMaintenance(
      Maintenance.findById(maintenance._id)
    );

    await recordAuditLog({
      building: maintenance.building,
      action: "updated",
      entityType: "maintenance",
      entityId: maintenance._id,
      entityLabel: maintenance.requestId,
      message: `Maintenance request ${maintenance.requestId} actual cost updated`
    });

    res.json({
      message: "Actual cost updated",
      maintenance: serializeMaintenance(populatedMaintenance)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/maintenance/:id", async (req, res) => {
  try {
    const maintenance = await Maintenance.findByIdAndDelete(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }

    await recordAuditLog({
      building: maintenance.building,
      action: "deleted",
      entityType: "maintenance",
      entityId: maintenance._id,
      entityLabel: maintenance.requestId,
      message: `Maintenance request ${maintenance.requestId} deleted`
    });

    res.json({ message: "Maintenance request deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
