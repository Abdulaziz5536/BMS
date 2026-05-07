const express = require("express");
const router = express.Router();

const Utility = require("../models/utility-model");
const Tenant = require("../models/tenant-model");

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
      status,
      notes
    } = req.body;

    if (!building || !tenant) {
      return res.status(400).json({ error: "Building and tenant are required" });
    }

    const tenantRecord = await Tenant.findOne({ _id: tenant, building });

    if (!tenantRecord) {
      return res.status(400).json({ error: "Tenant does not belong to this building" });
    }

    const utility = await Utility.create({
      building,
      tenant,
      waterAmount: Number(waterAmount) || 0,
      lightAmount: Number(lightAmount) || 0,
      generatorGasAmount: Number(generatorGasAmount) || 0,
      dueDate,
      status: status || "pending",
      notes
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
      status,
      notes
    } = req.body;

    if (!building || !tenant) {
      return res.status(400).json({ error: "Building and tenant are required" });
    }

    const tenantRecord = await Tenant.findOne({ _id: tenant, building });

    if (!tenantRecord) {
      return res.status(400).json({ error: "Tenant does not belong to this building" });
    }

    const utility = await Utility.findByIdAndUpdate(
      req.params.id,
      {
        building,
        tenant,
        waterAmount: Number(waterAmount) || 0,
        lightAmount: Number(lightAmount) || 0,
        generatorGasAmount: Number(generatorGasAmount) || 0,
        dueDate,
        status: status || "pending",
        notes
      },
      { new: true }
    );

    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    res.json({ message: "Utility payment updated", utility });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/utilities/:id/pay", async (req, res) => {
  try {
    const utility = await Utility.findByIdAndUpdate(
      req.params.id,
      { status: "paid" },
      { new: true }
    );

    if (!utility) {
      return res.status(404).json({ error: "Utility payment not found" });
    }

    res.json({ message: "Utility payment marked as paid", utility });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
