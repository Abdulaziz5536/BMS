const express = require('express');
const router = express.Router();
const Floor = require('../models/floor-model');
const Unit = require('../models/unit-model');
const { recordAuditLog } = require('../services/audit-log-service');
const { formatFloorLabel, MIN_BASEMENT_FLOOR } = require('../utils/floor-label-utils');

const isMissing = (value) => value === undefined || value === null || value === "";

// Central floor validation keeps create/update behavior identical.
// Negative floors are allowed only for supported basement levels, displayed as B1..B4.
const getValidatedFloorPayload = ({ building, floor, units, totalSqm }) => {
  if (!building || isMissing(floor) || isMissing(units) || isMissing(totalSqm)) {
    return { error: "All fields are required" };
  }

  const floorNumber = Number(floor);
  const unitCount = Number(units);
  const totalArea = Number(totalSqm);

  if (!Number.isFinite(floorNumber) || !Number.isFinite(unitCount) || !Number.isFinite(totalArea)) {
    return { error: "Floor, units, and total SQM must be valid numbers" };
  }

  if (!Number.isInteger(floorNumber)) {
    return { error: "Floor must be a whole number" };
  }

  if (floorNumber < MIN_BASEMENT_FLOOR) {
    return { error: `Basement floor cannot be below ${formatFloorLabel(MIN_BASEMENT_FLOOR)}` };
  }

  if (!Number.isInteger(unitCount)) {
    return { error: "Units must be a whole number" };
  }

  if (unitCount < 0 || totalArea < 0) {
    return { error: "Units and total SQM cannot be negative" };
  }

  return {
    values: {
      building,
      floorNumber,
      unitCount,
      totalArea
    }
  };
};

router.post('/floors', async (req, res) => {
  try {
    const validation = getValidatedFloorPayload(req.body);

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const { building, floorNumber, unitCount, totalArea } = validation.values;

    // A floor number only needs to be unique inside the same building.
    const existingFloor = await Floor.findOne({
      building,
      floor: floorNumber
    });

    if (existingFloor) {
      return res.status(400).json({ error: "Floor already exists in this building" });
    }

    const newFloor = await Floor.create({
      building,
      floor: floorNumber,
      units: unitCount,
      totalSqm: totalArea
    });

    const floorLabel = formatFloorLabel(newFloor.floor);

    await recordAuditLog({
      building: newFloor.building,
      action: "created",
      entityType: "floor",
      entityId: newFloor._id,
      entityLabel: floorLabel,
      message: `Floor ${floorLabel} created`
    });

    res.status(201).json({
      message: "Floor added successfully",
      newFloor
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/floors', async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    const floors = await Floor.find(filter).sort({ floor: 1 });
    res.json(floors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/floors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = getValidatedFloorPayload(req.body);

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const { building, floorNumber, unitCount, totalArea } = validation.values;

    const existingFloor = await Floor.findOne({
      building,
      floor: floorNumber,
      _id: { $ne: id }
    });

    if (existingFloor) {
      return res.status(400).json({ error: "Floor already exists in this building" });
    }

    const updatedFloor = await Floor.findByIdAndUpdate(
      id,
      {
        building,
        floor: floorNumber,
        units: unitCount,
        totalSqm: totalArea
      },
      { returnDocument: "after" }
    );

    if (!updatedFloor) {
      return res.status(404).json({ error: "Floor not found" });
    }

    const floorLabel = formatFloorLabel(updatedFloor.floor);

    await recordAuditLog({
      building: updatedFloor.building,
      action: "updated",
      entityType: "floor",
      entityId: updatedFloor._id,
      entityLabel: floorLabel,
      message: `Floor ${floorLabel} updated`
    });

    res.json({
      message: "Floor updated successfully",
      updatedFloor
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/floors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Floors with units cannot be deleted because tenants and invoices depend on those units.
    const unitCount = await Unit.countDocuments({ floor: id });

    if (unitCount > 0) {
      return res.status(400).json({
        error: "Cannot delete this floor because units are assigned to it. Delete or move those units first."
      });
    }

    const deletedFloor = await Floor.findByIdAndDelete(id);

    if (!deletedFloor) {
      return res.status(404).json({ error: "Floor not found" });
    }

    const floorLabel = formatFloorLabel(deletedFloor.floor);

    await recordAuditLog({
      building: deletedFloor.building,
      action: "deleted",
      entityType: "floor",
      entityId: deletedFloor._id,
      entityLabel: floorLabel,
      message: `Floor ${floorLabel} deleted`
    });

    res.json({ message: "Floor deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
