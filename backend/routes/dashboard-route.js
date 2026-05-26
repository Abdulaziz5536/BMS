const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Floor = require("../models/floor-model");
const Tenant = require("../models/tenant-model");
const Employee = require("../models/employees-model");
const Contract = require("../models/contract-model");
const Utility = require("../models/utility-model");
const Invoice = require("../models/invoice-model");
const PaymentRecord = require("../models/payment-record-model");
const AuditLog = require("../models/audit-log-model");

// Dashboard route builds a compact summary for the selected building.
// It reads from several collections, so every query must use the same building filter.

router.get("/dashboard", async (req,res) => {

  try {
  const filter = req.query.building ? { building: req.query.building } : {};
  const aggregateFilter = req.query.building && mongoose.Types.ObjectId.isValid(req.query.building)
    ? { building: new mongoose.Types.ObjectId(req.query.building) }
    : {};

  // Total units comes from floor metadata; occupied units comes from tenants assigned to units.
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
    
    // Contract revenue is normalized to a monthly number for yearly/quarterly contracts.
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonEnd = new Date(today);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);
  dueSoonEnd.setHours(23, 59, 59, 999);

  // Outstanding rent is based on invoice balances, not contract status.
  const invoiceOutstanding = await Invoice.aggregate([
    { $match: { ...aggregateFilter, outstandingBalance: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$outstandingBalance" }, count: { $sum: 1 } } }
  ]);

  const outstandingRent = invoiceOutstanding[0]?.total || 0;
  const outstandingInvoiceCount = invoiceOutstanding[0]?.count || 0;

  const [dueSoonInvoices, overdueInvoices] = await Promise.all([
    Invoice.countDocuments({ ...filter, status: { $in: ["pending", "overdue"] }, dueDate: { $gte: today, $lte: dueSoonEnd } }),
    Invoice.countDocuments({ ...filter, status: { $in: ["pending", "overdue"] }, dueDate: { $lt: today } })
  ]);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthlyPaymentResult = await PaymentRecord.aggregate([
    {
      $match: {
        ...aggregateFilter,
        paymentDate: { $gte: monthStart, $lt: monthEnd }
      }
    },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
  ]);

  // Recent activity gives the dashboard a quick audit trail for user actions.
  const recentActivity = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

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
      occupancyRate,
      outstandingRent,
      outstandingInvoiceCount,
      dueSoonInvoices,
      overdueInvoices,
      monthlyCollected: monthlyPaymentResult[0]?.total || 0,
      monthlyPaymentCount: monthlyPaymentResult[0]?.count || 0,
      recentActivity
    });
    
  } catch (error) {
    return res.status(500).json({error:error.message});
  }
  
});


module.exports = router;
