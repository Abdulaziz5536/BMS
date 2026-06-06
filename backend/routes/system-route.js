const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const AuditLog = require("../models/audit-log-model");
const Building = require("../models/building-model");
const Contract = require("../models/contract-model");
const Employee = require("../models/employees-model");
const Floor = require("../models/floor-model");
const Invoice = require("../models/invoice-model");
const PaymentRecord = require("../models/payment-record-model");
const Tenant = require("../models/tenant-model");
const Unit = require("../models/unit-model");
const Utility = require("../models/utility-model");
const { buildCsv } = require("../utils/csv-utils");
const { formatFloorLabel } = require("../utils/floor-label-utils");
const { normalizePaymentFrequency } = require("../utils/payment-frequency-utils");
const { getSystemChecks } = require("../services/system-check-service");

// System routes are operational tools: health checks, audit logs, JSON backup,
// and CSV exports. They help an owner run and diagnose the deployed system.

const validateBuildingQuery = (req, res) => {
  const { building } = req.query;

  if (building && !mongoose.Types.ObjectId.isValid(building)) {
    res.status(400).json({ error: "Invalid building id" });
    return null;
  }

  return building || "";
};

const setCsvHeaders = (res, filename) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
};

router.get("/system/health", (req, res) => {
  // Health endpoint returns 503 when required checks fail, useful for deployment monitors.
  const checks = getSystemChecks();
  res.status(checks.ok ? 200 : 503).json({
    status: checks.ok ? "ok" : "needs_attention",
    timestamp: new Date(),
    ...checks
  });
});

router.get("/system/checks", (req, res) => {
  res.json(getSystemChecks());
});

router.get("/audit-logs", async (req, res) => {
  try {
    const buildingId = validateBuildingQuery(req, res);
    if (buildingId === null) return;

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter = buildingId ? { building: buildingId } : {};

    const logs = await AuditLog.find(filter)
      .populate("building", "name")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/system/backup", async (req, res) => {
  try {
    const buildingId = validateBuildingQuery(req, res);
    if (buildingId === null) return;

    const buildingFilter = buildingId ? { _id: buildingId } : {};
    const childFilter = buildingId ? { building: buildingId } : {};

    // Backup gathers every major collection. Restore/import can use schemaVersion later.
    const [
      buildings,
      floors,
      units,
      tenants,
      employees,
      contracts,
      utilities,
      invoices,
      paymentRecords,
      auditLogs
    ] = await Promise.all([
      Building.find(buildingFilter).lean(),
      Floor.find(childFilter).lean(),
      Unit.find(childFilter).lean(),
      Tenant.find(childFilter).lean(),
      Employee.find(childFilter).lean(),
      Contract.find(childFilter).lean(),
      Utility.find(childFilter).lean(),
      Invoice.find(childFilter).lean(),
      PaymentRecord.find(childFilter).lean(),
      AuditLog.find(childFilter).sort({ createdAt: -1 }).limit(1000).lean()
    ]);
    const data = {
      buildings,
      floors,
      units,
      tenants,
      employees,
      contracts,
      utilities,
      invoices,
      paymentRecords,
      auditLogs
    };
    const counts = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
    );

    res.json({
      schemaVersion: 1,
      exportedAt: new Date(),
      building: buildingId || "all",
      counts,
      systemChecks: getSystemChecks(),
      data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/exports/:resource", async (req, res) => {
  try {
    const buildingId = validateBuildingQuery(req, res);
    if (buildingId === null) return;

    const childFilter = buildingId ? { building: buildingId } : {};
    const { resource } = req.params;
    let rows = [];
    let columns = [];

    // Each export defines rows and columns separately so CSV formatting stays shared.
    if (resource === "tenants") {
      rows = await Tenant.find(childFilter)
        .populate({ path: "unit", populate: { path: "floor" } })
        .lean();
      columns = [
        { label: "Tenant ID", value: (row) => row.tenantId },
        { label: "Name", value: (row) => row.tenantName },
        { label: "TIN", value: (row) => row.tinNumber },
        { label: "Phone", value: (row) => row.phone },
        { label: "Email", value: (row) => row.email },
        { label: "Unit", value: (row) => row.unit?.unitId },
        { label: "Floor", value: (row) => formatFloorLabel(row.unit?.floor?.floor) },
        { label: "Move In", value: (row) => row.moveInDate },
        { label: "Move Out", value: (row) => row.moveOutDate },
        { label: "Emergency Contact", value: (row) => row.emergencyContactName },
        { label: "Emergency Phone", value: (row) => row.emergencyContactPhone }
      ];
    } else if (resource === "invoices") {
      rows = await Invoice.find(childFilter).populate("tenant").lean();
      columns = [
        { label: "Invoice Number", value: (row) => row.invoiceNumber },
        { label: "Tenant", value: (row) => row.tenant?.tenantName },
        { label: "Period Start", value: (row) => row.periodStart },
        { label: "Period End", value: (row) => row.periodEnd },
        { label: "Due Date", value: (row) => row.dueDate },
        { label: "Total", value: (row) => row.totalAmount },
        { label: "Paid", value: (row) => row.amountPaid },
        { label: "Outstanding", value: (row) => row.outstandingBalance },
        { label: "Status", value: (row) => row.status }
      ];
    } else if (resource === "contracts") {
      rows = await Contract.find(childFilter).populate("tenant").lean();
      columns = [
        { label: "Tenant", value: (row) => row.tenant?.tenantName },
        { label: "Amount", value: (row) => row.amount },
        { label: "Lease Start", value: (row) => row.leaseStartDate || row.date },
        { label: "Lease End", value: (row) => row.leaseEndDate },
        { label: "Payment Frequency", value: (row) => normalizePaymentFrequency(row.paymentFrequency) },
        { label: "Status", value: (row) => row.status }
      ];
    } else if (resource === "payments") {
      rows = await PaymentRecord.find(childFilter).populate("tenant invoice contract utility").lean();
      columns = [
        { label: "Payment Date", value: (row) => row.paymentDate },
        { label: "Tenant", value: (row) => row.tenant?.tenantName },
        { label: "Invoice", value: (row) => row.invoice?.invoiceNumber },
        { label: "Contract", value: (row) => normalizePaymentFrequency(row.contract?.paymentFrequency) },
        { label: "Utility", value: (row) => row.utility ? "Utility payment" : "" },
        { label: "Amount", value: (row) => row.amount },
        { label: "Method", value: (row) => row.paymentMethod },
        { label: "Reference", value: (row) => row.reference },
        { label: "Notes", value: (row) => row.notes }
      ];
    } else if (resource === "employees") {
      rows = await Employee.find(childFilter).lean();
      columns = [
        { label: "Name", value: (row) => row.name },
        { label: "Position", value: (row) => row.position },
        { label: "Phone", value: (row) => row.phoneNumber },
        { label: "Email", value: (row) => row.email },
        { label: "Basic Salary", value: (row) => row.salary },
        { label: "Transport Allowance", value: (row) => row.transportAllowance },
        { label: "Loan", value: (row) => row.loan },
        { label: "Emergency Contact", value: (row) => row.emergencyContactName },
        { label: "Emergency Phone", value: (row) => row.emergencyContactPhone }
      ];
    } else {
      return res.status(404).json({ error: "Export resource not found" });
    }

    setCsvHeaders(res, `${resource}-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(buildCsv(rows, columns));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
