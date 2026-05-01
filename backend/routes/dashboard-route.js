const express = require("express");
const router = express.Router();
const Floor = require("../models/floor-model");
const Unit = require("../models/unit-model");
const Tenant = require("../models/tenant-model");

router.get("/dashboard", async (req,res) => {

  try {
    

  const totalFloors = await Floor.countDocuments();
  const totalUnits = await Unit.countDocuments();
  const totalTenants = await Tenant.countDocuments();
  res.json({totalFloors,totalUnits,totalTenants});
    
  } catch (error) {
    return res.status(500).json({error:error.message});
  }
  
});

module.exports = router;