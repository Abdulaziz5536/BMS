const express = require("express");
const router = express.Router();
const Unit = require("../models/unit-model");
const Tenant = require("../models/tenant-model");
const Employee = require("../models/employees-model");
const Contract = require("../models/contract-model");

router.get("/dashboard", async (req,res) => {

  try {
    

  
  const totalUnitsOccupied = await Unit.countDocuments();
  const totalTenants = await Tenant.countDocuments();
  const totalEmployees = await Employee.countDocuments();
  


   
    const TOTAL_BUILDING_UNITS = 50; 

    const occupiedUnits = await Tenant.distinct("unit");

     const occupancyRate =
    TOTAL_BUILDING_UNITS === 0 ? 0 : ((occupiedUnits.length / TOTAL_BUILDING_UNITS) * 100).toFixed(1);
    
    const revenueResult = await Contract.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;

    
    const pendingPayments = await Contract.countDocuments({
      status: "pending"
    });

    res.json({
      totalUnitsOccupied,
      totalTenants,
      totalEmployees,
      totalRevenue,
      pendingPayments,
      occupancyRate
    });
    
  } catch (error) {
    return res.status(500).json({error:error.message});
  }
  
});


module.exports = router;