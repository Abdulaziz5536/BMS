const express = require('express');
const router = express.Router();
const Floor = require('../models/floor-model');
const Unit = require('../models/unit-model');
const { recordAuditLog } = require('../services/audit-log-service');

router.post('/floors', async (req, res) => {
  try {
    const { building, floor, units, totalSqm } = req.body;
    const floorNumber = Number(floor);
    const unitCount = Number(units);
    const totalArea = Number(totalSqm);

    if (!building || floor === undefined || units === undefined || totalSqm === undefined) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!Number.isFinite(floorNumber) || !Number.isFinite(unitCount) || !Number.isFinite(totalArea)) {
      return res.status(400).json({ error: "Floor, units, and total SQM must be valid numbers" });
    }

    if (unitCount < 0 || totalArea < 0) {
      return res.status(400).json({ error: "Units and total SQM cannot be negative" });
    }

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

    await recordAuditLog({
      building: newFloor.building,
      action: "created",
      entityType: "floor",
      entityId: newFloor._id,
      entityLabel: String(newFloor.floor),
      message: `Floor ${newFloor.floor} created`
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
    const { building, floor, units, totalSqm } = req.body;
    const floorNumber = Number(floor);
    const unitCount = Number(units);
    const totalArea = Number(totalSqm);

    if (!building || floor === undefined || units === undefined || totalSqm === undefined) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!Number.isFinite(floorNumber) || !Number.isFinite(unitCount) || !Number.isFinite(totalArea)) {
      return res.status(400).json({ error: "Floor, units, and total SQM must be valid numbers" });
    }

    if (unitCount < 0 || totalArea < 0) {
      return res.status(400).json({ error: "Units and total SQM cannot be negative" });
    }

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

    await recordAuditLog({
      building: updatedFloor.building,
      action: "updated",
      entityType: "floor",
      entityId: updatedFloor._id,
      entityLabel: String(updatedFloor.floor),
      message: `Floor ${updatedFloor.floor} updated`
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

    await recordAuditLog({
      building: deletedFloor.building,
      action: "deleted",
      entityType: "floor",
      entityId: deletedFloor._id,
      entityLabel: String(deletedFloor.floor),
      message: `Floor ${deletedFloor.floor} deleted`
    });

    res.json({ message: "Floor deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
