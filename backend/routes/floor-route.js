const express = require('express');
const router = express.Router();
const Floor = require('../models/floor-model');

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

    const deletedFloor = await Floor.findByIdAndDelete(id);

    if (!deletedFloor) {
      return res.status(404).json({ error: "Floor not found" });
    }

    res.json({ message: "Floor deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
