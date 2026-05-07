const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Floor = require("../models/floor-model");
const Tenant = require("../models/tenant-model");
const Employee = require("../models/employees-model");
const Contract = require("../models/contract-model");
const Utility = require("../models/utility-model");

router.get("/dashboard", async (req,res) => {

  try {
  const filter = req.query.building ? { building: req.query.building } : {};
  const aggregateFilter = req.query.building && mongoose.Types.ObjectId.isValid(req.query.building)
    ? { building: new mongoose.Types.ObjectId(req.query.building) }
    : {};

  const floorUnitsResult = await Floor.aggregate([
    { $match: aggregateFilter },
    {
      $group: {
        _id: null,
        total: { $sum: "$units" }
      }
    }
  ]);

  const totalUnits = floorUnitsResult[0]?.total || 0;
  const totalTenants = await Tenant.countDocuments(filter);
  const totalEmployees = await Employee.countDocuments(filter);
  const occupiedUnits = await Tenant.distinct("unit", filter);
  const totalUnitsOccupied = occupiedUnits.length;
  const totalUnitsAvailable = Math.max(totalUnits - totalUnitsOccupied, 0);

     const occupancyRate =
    totalUnits === 0 ? 0 : ((occupiedUnits.length / totalUnits) * 100).toFixed(1);
    
    const revenueResult = await Contract.aggregate([
      { $match: { ...aggregateFilter, status: "paid" } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$paymentFrequency", "Yearly"] },
                    then: { $divide: ["$amount", 12] }
                  },
                  {
                    case: { $eq: ["$paymentFrequency", "Quarterly"] },
                    then: { $divide: ["$amount", 3] }
                  },
                  {
                    case: { $eq: ["$paymentFrequency", "Every 6 months"] },
                    then: { $divide: ["$amount", 6] }
                  }
                ],
                default: "$amount"
              }
            }
          }
        }
      }
    ]);

    const totalRevenue = Number((revenueResult[0]?.total || 0).toFixed(2));

    const utilityRevenueResult = await Utility.aggregate([
      { $match: { ...aggregateFilter, status: "paid" } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: ["$waterAmount", "$lightAmount", "$generatorGasAmount"]
            }
          }
        }
      }
    ]);

    const utilityRevenue = utilityRevenueResult[0]?.total || 0;

    
    const pendingPayments = await Contract.countDocuments({
      ...filter,
      status: "pending"
    });

    const pendingUtilityPayments = await Utility.countDocuments({
      ...filter,
      status: "pending"
    });

    res.json({
      totalUnits,
      totalUnitsOccupied,
      totalUnitsAvailable,
      totalTenants,
      totalEmployees,
      totalRevenue,
      utilityRevenue,
      pendingPayments,
      pendingUtilityPayments,
      occupancyRate
    });
    
  } catch (error) {
    return res.status(500).json({error:error.message});
  }
  
});


module.exports = router;
