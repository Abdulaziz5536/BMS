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
const { getEthiopianMonthRange } = require("../utils/date-utils");

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ethiopianMonthRange = getEthiopianMonthRange(today);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Monthly revenue is the normalized rent value from paid contracts:
    // yearly / 12, every 6 months / 6, quarterly / 3, monthly as-is.
    const monthlyRevenueResult = await Contract.aggregate([
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

    const monthlyRevenue = Number((monthlyRevenueResult[0]?.total || 0).toFixed(2));

    // Monthly rent revenue follows the current Ethiopian month and excludes utility payments.
    const rentRevenueResult = await PaymentRecord.aggregate([
      {
        $match: {
          ...aggregateFilter,
          paymentDate: {
            $gte: ethiopianMonthRange.start,
            $lt: ethiopianMonthRange.end
          },
          $or: [
            { invoice: { $exists: true, $ne: null } },
            { contract: { $exists: true, $ne: null } }
          ]
        }
      },
      {
        $lookup: {
          from: "invoices",
          localField: "invoice",
          foreignField: "_id",
          as: "invoiceDoc"
        }
      },
      {
        $lookup: {
          from: "contracts",
          localField: "contract",
          foreignField: "_id",
          as: "contractDoc"
        }
      },
      {
        $match: {
          $or: [
            {
              invoice: { $exists: true, $ne: null },
              "invoiceDoc.status": "paid"
            },
            {
              contract: { $exists: true, $ne: null },
              "contractDoc.status": "paid"
            }
          ]
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = Number((rentRevenueResult[0]?.total || 0).toFixed(2));

    // Utility revenue is also month-scoped using the Ethiopian calendar.
    const utilityRevenueResult = await PaymentRecord.aggregate([
      {
        $match: {
          ...aggregateFilter,
          paymentDate: {
            $gte: ethiopianMonthRange.start,
            $lt: ethiopianMonthRange.end
          },
          utility: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const utilityRevenue = Number((utilityRevenueResult[0]?.total || 0).toFixed(2));

    
    const pendingPayments = await Contract.countDocuments({
      ...filter,
      status: "pending"
    });

  const pendingUtilityPayments = await Utility.countDocuments({
    ...filter,
    status: "pending"
  });

  const dueSoonEnd = new Date(today);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);
  dueSoonEnd.setHours(23, 59, 59, 999);

  // Outstanding rent is based on invoice balances that are already due, not future invoices.
  const invoiceOutstanding = await Invoice.aggregate([
    {
      $match: {
        ...aggregateFilter,
        outstandingBalance: { $gt: 0 },
        dueDate: { $lt: tomorrow }
      }
    },
    { $group: { _id: null, total: { $sum: "$outstandingBalance" }, count: { $sum: 1 } } }
  ]);

  const outstandingRent = invoiceOutstanding[0]?.total || 0;
  const outstandingInvoiceCount = invoiceOutstanding[0]?.count || 0;

  const [dueSoonInvoices, overdueInvoices] = await Promise.all([
    Invoice.countDocuments({ ...filter, status: { $in: ["pending", "overdue"] }, dueDate: { $gte: today, $lte: dueSoonEnd } }),
    Invoice.countDocuments({ ...filter, status: { $in: ["pending", "overdue"] }, dueDate: { $lt: today } })
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
      monthlyRevenue,
      totalRevenue,
      utilityRevenue,
      pendingPayments,
      pendingUtilityPayments,
      occupancyRate,
      outstandingRent,
      outstandingInvoiceCount,
      dueSoonInvoices,
      overdueInvoices,
      monthlyCollected: totalRevenue,
      monthlyPaymentCount: rentRevenueResult[0]?.count || 0,
      monthlyRentCollected: totalRevenue,
      monthlyRentPaymentCount: rentRevenueResult[0]?.count || 0,
      monthlyUtilityCollected: utilityRevenue,
      monthlyUtilityPaymentCount: utilityRevenueResult[0]?.count || 0,
      recentActivity
    });
    
  } catch (error) {
    return res.status(500).json({error:error.message});
  }
  
});


module.exports = router;
