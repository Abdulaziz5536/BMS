const express = require("express");
const router = express.Router();
const Unit = require("../models/unit-model");
const Tenant = require("../models/tenant-model");
const Employee = require("../models/employees-model");

router.get("/dashboard", async (req,res) => {

  try {
    

  
  const totalUnits = await Unit.countDocuments();
  const totalTenants = await Tenant.countDocuments();
  const totalEmployees = await Employee.countDocuments();
  res.json({totalUnits,totalTenants,totalEmployees});
    
  } catch (error) {
    return res.status(500).json({error:error.message});
  }
  
});

module.exports = router;