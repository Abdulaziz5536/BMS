const express = require('express');
const router = express.Router();
const Floor = require('../models/floor-model');

router.post('/floors', async (req, res) => {
  try {
    console.log("POST /floors body:", req.body);

    const { floor, units, totalSqm } = req.body;

    if (floor === undefined || units === undefined || totalSqm === undefined) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const newFloor = await Floor.create({
      floor: Number(floor),
      units: Number(units),
      totalSqm: Number(totalSqm)
    });

    console.log("Floor added successfully:", newFloor);

    res.status(201).json({
      message: "Floor added successfully",
      newFloor
    });
  } catch (error) {
    console.log("POST /floors error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/floors', async (req, res) => {
  try {
    
    const floors = await Floor.find().sort({ floor: 1 });
    res.json(floors);
  } catch (error) {
    
    res.status(500).json({ error: error.message });
  }
});

router.put('/floors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { floor, units, totalSqm } = req.body;

    const updatedFloor = await Floor.findByIdAndUpdate(
      id,
      {
        floor: Number(floor),
        units: Number(units),
        totalSqm: Number(totalSqm)
      },
      { new: true }
    );

    if (!updatedFloor) {
      return res.status(404).json({ error: "Floor not found" });
    }

    res.json({
      message: "Floor updated successfully",
      updatedFloor
    });
  } catch (error) {
    console.log("PUT /floors error:", error);
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
    console.log("DELETE /floors error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;