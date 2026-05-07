const express = require("express");
const router = express.Router();

const Building = require("../models/building-model");
const Floor = require("../models/floor-model");
const Unit = require("../models/unit-model");
const Tenant = require("../models/tenant-model");
const Employee = require("../models/employees-model");
const Contract = require("../models/contract-model");
const Utility = require("../models/utility-model");

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

    const building = await Building.create({
      name,
      address,
      managerName,
      phone,
      notes
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

    const building = await Building.findByIdAndUpdate(
      req.params.id,
      { name, address, managerName, phone, notes },
      { new: true }
    );

    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

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

    await Promise.all([
      Floor.deleteMany({ building: req.params.id }),
      Unit.deleteMany({ building: req.params.id }),
      Tenant.deleteMany({ building: req.params.id }),
      Employee.deleteMany({ building: req.params.id }),
      Contract.deleteMany({ building: req.params.id }),
      Utility.deleteMany({ building: req.params.id })
    ]);

    await Building.findByIdAndDelete(req.params.id);

    res.json({ message: "Building and its data deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
