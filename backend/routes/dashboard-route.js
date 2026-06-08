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
const { getEthiopianMonthRange, parseFlexibleDateInput } = require("../utils/date-utils");
const { getMonthlyRevenueValue } = require("../utils/payment-frequency-utils");

// Dashboard route builds a compact summary for the selected building.
// It reads from several collections, so every query must use the same building filter.

const getUtilityTotal = (utility) =>
  (Number(utility.waterAmount) || 0) +
  (Number(utility.lightAmount) || 0) +
  (Number(utility.generatorGasAmount) || 0);

const isDateInRange = (value, startDate, endDate) => {
  const date = parseFlexibleDateInput(value);
  return Boolean(date && date >= startDate && date < endDate);
};

router.get("/dashboard", async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    const aggregateFilter = req.query.building && mongoose.Types.ObjectId.isValid(req.query.building)
      ? { building: new mongoose.Types.ObjectId(req.query.building) }
      : {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDate = parseFlexibleDateInput(today) || today;
    const ethiopianMonthRange = getEthiopianMonthRange(today);

    const dueSoonEnd = new Date(today);
    dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);
    dueSoonEnd.setHours(23, 59, 59, 999);

    // Dashboard data comes from independent collections, so run the reads together.
    const [
      floorUnitsResult,
      totalTenants,
      totalEmployees,
      occupiedUnits,
      monthlyRevenueContracts,
      utilityRevenueBills,
      rentRevenueResult,
      monthlyUtilityCollectedResult,
      pendingPayments,
      pendingUtilityPayments,
      invoiceOutstanding,
      dueSoonInvoices,
      overdueInvoices,
      recentActivity
    ] = await Promise.all([
      Floor.aggregate([
        { $match: aggregateFilter },
        {
          $group: {
            _id: null,
            total: { $sum: "$units" }
          }
        }
      ]),
      Tenant.countDocuments(filter),
      Employee.countDocuments(filter),
      Tenant.distinct("unit", filter),
      Contract.find(aggregateFilter)
        .select("tenant amount paymentFrequency date leaseStartDate leaseEndDate createdAt")
        .lean(),
      // Utility revenue is the value of utility bills due in the current Ethiopian month, paid or pending.
      Utility.find(aggregateFilter)
        .select("tenant waterAmount lightAmount generatorGasAmount dueDate status")
        .lean(),
      // Monthly rent revenue follows the current Ethiopian month and excludes utility payments.
      PaymentRecord.aggregate([
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
      ]),
      // Utility collected is month-scoped using the Ethiopian calendar.
      PaymentRecord.aggregate([
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
          $lookup: {
            from: "utilities",
            localField: "utility",
            foreignField: "_id",
            as: "utilityDoc"
          }
        },
        {
          $match: {
            "utilityDoc.status": "paid"
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        }
      ]),
      Contract.countDocuments({
        ...filter,
        status: "pending"
      }),
      Utility.countDocuments({
        ...filter,
        status: "pending"
      }),
      // Outstanding rent matches the viewer Not Paid rule: unpaid invoices due this Ethiopian month or earlier.
      Invoice.aggregate([
        {
          $match: {
            ...aggregateFilter,
            outstandingBalance: { $gt: 0 },
            dueDate: { $lt: ethiopianMonthRange.end }
          }
        },
        { $group: { _id: null, total: { $sum: "$outstandingBalance" }, count: { $sum: 1 } } }
      ]),
      Invoice.countDocuments({
        ...filter,
        status: { $in: ["pending", "overdue"] },
        dueDate: { $gte: today, $lte: dueSoonEnd }
      }),
      Invoice.countDocuments({
        ...filter,
        status: { $in: ["pending", "overdue"] },
        dueDate: { $lt: today }
      }),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
    ]);

    const totalUnits = floorUnitsResult[0]?.total || 0;
    const totalUnitsOccupied = occupiedUnits.length;
    const totalUnitsAvailable = Math.max(totalUnits - totalUnitsOccupied, 0);
    const occupancyRate =
      totalUnits === 0 ? 0 : ((occupiedUnits.length / totalUnits) * 100).toFixed(1);
    const currentContractsByTenant = new Map();

    monthlyRevenueContracts.forEach((contract) => {
      const leaseStart = parseFlexibleDateInput(contract.leaseStartDate || contract.date);
      const leaseEnd = parseFlexibleDateInput(contract.leaseEndDate);

      if (!leaseStart || !leaseEnd || leaseStart > currentDate || leaseEnd < currentDate) {
        return;
      }

      const tenantKey = String(contract.tenant || contract._id);
      const existing = currentContractsByTenant.get(tenantKey);
      const currentStartTime = leaseStart.getTime();
      const existingStartTime = parseFlexibleDateInput(existing?.leaseStartDate || existing?.date)?.getTime() || 0;

      if (!existing || currentStartTime >= existingStartTime) {
        currentContractsByTenant.set(tenantKey, contract);
      }
    });

    const monthlyRevenue = Number(
      Array.from(currentContractsByTenant.values())
        .reduce((sum, contract) => (
          sum + getMonthlyRevenueValue(contract.amount, contract.paymentFrequency)
        ), 0)
        .toFixed(2)
    );
    const utilityRevenue = Number(
      utilityRevenueBills
        .filter((utility) => isDateInRange(utility.dueDate, ethiopianMonthRange.start, ethiopianMonthRange.end))
        .reduce((sum, utility) => (
          sum + getUtilityTotal(utility)
        ), 0)
        .toFixed(2)
    );
    const totalRevenue = Number((rentRevenueResult[0]?.total || 0).toFixed(2));
    const monthlyUtilityCollected = Number((monthlyUtilityCollectedResult[0]?.total || 0).toFixed(2));
    const outstandingRent = invoiceOutstanding[0]?.total || 0;
    const outstandingInvoiceCount = invoiceOutstanding[0]?.count || 0;

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
      monthlyUtilityCollected,
      monthlyUtilityPaymentCount: monthlyUtilityCollectedResult[0]?.count || 0,
      recentActivity
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


module.exports = router;
