const express = require('express');
const router = express.Router();
const Contract = require('../models/contract-model');
const Invoice = require('../models/invoice-model');
const RentInvoice = require('../models/rent-invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Tenant = require('../models/tenant-model');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  applyContractStatusToInvoices,
  syncContractPaymentState
} = require('../services/payment-status-sync-service');
const { recalculateInvoicePeriodsForContract } = require('../services/invoice-period-service');
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput,
  toIsoDate
} = require('../utils/date-utils');

const MAX_FILE_DATA_LENGTH = 7000000;

const isValidFile = (file) => {
  if (!file) return true;
  return Boolean(
    file.name &&
      file.type &&
      typeof file.data === 'string' &&
      file.data.length <= MAX_FILE_DATA_LENGTH
  );
};

const normalizeTenantFile = (file) => {
  if (!file) return undefined;
  return {
    name: file.name || '',
    type: file.type || '',
    data: file.data
  };
};

const getContractLabel = (contract) =>
  `${contract.paymentFrequency || "Contract"} / Br ${contract.amount || 0}`;

router.get('/contract', async (req, res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    const contract = await Contract.find(filter).populate({
      path: "tenant",
      populate: {
        path: "unit",
        populate: {
          path: "floor"
        }
      }
    });
    res.json(contract);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contract', async (req, res) => {
  try {
    const {
      building,
      tenant,
      amount,
      date,
      leaseStartDate,
      leaseEndDate,
      contractLength,
      paymentFrequency,
      status,
      contractFile
    } = req.body;

    const startDate = leaseStartDate || date;

    if (!building || !tenant || !amount || !startDate || !leaseEndDate || !paymentFrequency) {
      return res.status(400).json({ error: "Please fill in all fields" });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Contract amount must be greater than zero" });
    }

    const startDateObj = parseFlexibleDateInput(startDate);
    const leaseEndDateObj = parseFlexibleDateInput(leaseEndDate);

    if (!startDateObj || !leaseEndDateObj) {
      return res.status(400).json({ error: "Invalid lease date" });
    }

    if (leaseEndDateObj < startDateObj) {
      return res.status(400).json({ error: "Lease end date cannot be before lease start date" });
    }

    const normalizedStartDate = normalizeDateOnlyString(startDate);
    const normalizedLeaseEndDate = normalizeDateOnlyString(leaseEndDate);

    const tenantRecord = await Tenant.findOne({ _id: tenant, building });

    if (!tenantRecord) {
      return res.status(400).json({ error: "Tenant does not belong to this building" });
    }

    const normalizedContractFile = normalizeTenantFile(contractFile);
    if (!isValidFile(normalizedContractFile)) {
      return res.status(400).json({ error: "Uploaded file is invalid or too large" });
    }

    const contract = await Contract.create({
      building,
      tenant,
      amount: Number(amount),
      date: normalizedStartDate,
      leaseStartDate: normalizedStartDate,
      leaseEndDate: normalizedLeaseEndDate,
      contractLength,
      paymentFrequency,
      status: status || "pending",
      contractFile: normalizedContractFile
    });

    await recordAuditLog({
      building: contract.building,
      action: "created",
      entityType: "contract",
      entityId: contract._id,
      entityLabel: getContractLabel(contract),
      message: "Contract created"
    });

    res.json({ message: "contract created", contract });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.put('/contract/:id', async (req, res) => {
  try {
    const {
      building,
      tenant,
      amount,
      date,
      leaseStartDate,
      leaseEndDate,
      contractLength,
      paymentFrequency,
      status,
      contractFile
    } = req.body || {};

    const startDate = leaseStartDate || date;

    if (!building || !tenant || !amount || !startDate || !leaseEndDate || !paymentFrequency) {
      return res.status(400).json({ error: "Please fill in all fields" });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Contract amount must be greater than zero" });
    }

    const startDateObj = parseFlexibleDateInput(startDate);
    const leaseEndDateObj = parseFlexibleDateInput(leaseEndDate);

    if (!startDateObj || !leaseEndDateObj) {
      return res.status(400).json({ error: "Invalid lease date" });
    }

    if (leaseEndDateObj < startDateObj) {
      return res.status(400).json({ error: "Lease end date cannot be before lease start date" });
    }

    const normalizedStartDate = normalizeDateOnlyString(startDate);
    const normalizedLeaseEndDate = normalizeDateOnlyString(leaseEndDate);

    const tenantRecord = await Tenant.findOne({ _id: tenant, building });

    if (!tenantRecord) {
      return res.status(400).json({ error: "Tenant does not belong to this building" });
    }

    const normalizedContractFile = normalizeTenantFile(contractFile);
    if (!isValidFile(normalizedContractFile)) {
      return res.status(400).json({ error: "Uploaded file is invalid or too large" });
    }

    const updatedContract = await Contract.findByIdAndUpdate(
      req.params.id,
      {
        building,
        tenant,
        amount: Number(amount),
        date: normalizedStartDate,
        leaseStartDate: normalizedStartDate,
        leaseEndDate: normalizedLeaseEndDate,
        contractLength,
        paymentFrequency,
        status: status || "pending",
        contractFile: normalizedContractFile
      },
      { returnDocument: "after" }
    );

    if (!updatedContract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    const [invoicePeriodSync, rentInvoicePeriodSync] = await Promise.all([
      recalculateInvoicePeriodsForContract(Invoice, updatedContract),
      recalculateInvoicePeriodsForContract(RentInvoice, updatedContract)
    ]);
    await applyContractStatusToInvoices(updatedContract, updatedContract.status);

    const invoicePeriodsUpdated =
      invoicePeriodSync.updated + rentInvoicePeriodSync.updated;
    const invoicePeriodsSkipped =
      invoicePeriodSync.skipped + rentInvoicePeriodSync.skipped;

    await recordAuditLog({
      building: updatedContract.building,
      action: "updated",
      entityType: "contract",
      entityId: updatedContract._id,
      entityLabel: getContractLabel(updatedContract),
      message: "Contract updated",
      metadata: {
        invoicePeriodsUpdated,
        invoicePeriodsSkipped
      }
    });

    return res.json({
      message: invoicePeriodsUpdated > 0
        ? `Contract updated and ${invoicePeriodsUpdated} invoice date${invoicePeriodsUpdated === 1 ? "" : "s"} updated`
        : "Contract updated",
      contract: updatedContract,
      invoicePeriodsUpdated,
      invoicePeriodsSkipped
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const parseDateOrNull = (value) => {
  if (!value) return null;
  return parseFlexibleDateInput(value);
};

const addFrequency = (date, paymentFrequency) => {
  if (!date) return null;

  const next = new Date(date);
  const freq = (paymentFrequency || "").toLowerCase();

  switch (freq) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'every 6 months':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }

  return next;
};

router.patch('/contract/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['pending', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: "after" }
    );

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    await applyContractStatusToInvoices(contract, status);
    await syncContractPaymentState(contract);
    await recordAuditLog({
      building: contract.building,
      action: "status_changed",
      entityType: "contract",
      entityId: contract._id,
      entityLabel: getContractLabel(contract),
      message: `Contract status changed to ${status}`
    });

    return res.json({
      message: "Contract status updated",
      contract
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/contract/:id/pay', async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (contract.status === "paid") {
      return res.status(400).json({ error: "Contract is already paid" });
    }

    // 1) mark current as paid
    contract.status = "paid";
    await contract.save();
    await applyContractStatusToInvoices(contract, "paid");
    const paymentRecord = await PaymentRecord.create({
      building: contract.building,
      tenant: contract.tenant,
      contract: contract._id,
      paymentDate: new Date(),
      amount: contract.amount,
      paymentMethod: "cash",
      notes: "Recorded from contract payment action"
    });

    // 2) create next pending contract based on paymentFrequency
    const baseStart = parseDateOrNull(contract.leaseStartDate || contract.date);
    const baseEnd = parseDateOrNull(contract.leaseEndDate);

    const nextStart = addFrequency(baseStart, contract.paymentFrequency);
    const nextEnd = addFrequency(baseEnd, contract.paymentFrequency);

    const nextContract = await Contract.create({
      building: contract.building,
      tenant: contract.tenant,
      amount: contract.amount,
      date: nextStart ? toIsoDate(nextStart) : "",
      leaseStartDate: nextStart ? toIsoDate(nextStart) : "",
      leaseEndDate: nextEnd ? toIsoDate(nextEnd) : "",
      contractLength: contract.contractLength,
      paymentFrequency: contract.paymentFrequency,
      status: "pending",
      contractFile: contract.contractFile
    });

    await recordAuditLog({
      building: contract.building,
      action: "recorded",
      entityType: "payment",
      entityId: paymentRecord._id,
      entityLabel: getContractLabel(contract),
      message: `Contract payment of Br ${contract.amount} recorded and next contract created`,
      metadata: {
        contract: contract._id,
        nextContract: nextContract._id
      }
    });

    return res.json({
      message: "Payment marked as paid and next contract created",
      contract,
      nextContract
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/contract/:id', async (req, res) => {
  try {
    const [invoiceCount, rentInvoiceCount, paymentCount] = await Promise.all([
      Invoice.countDocuments({ contract: req.params.id }),
      RentInvoice.countDocuments({ contract: req.params.id }),
      PaymentRecord.countDocuments({ contract: req.params.id })
    ]);

    if (invoiceCount || rentInvoiceCount || paymentCount) {
      return res.status(400).json({
        error: "Cannot delete this contract because it has invoices or payment records. Delete or cancel those records first."
      });
    }

    const contract = await Contract.findByIdAndDelete(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    await recordAuditLog({
      building: contract.building,
      action: "deleted",
      entityType: "contract",
      entityId: contract._id,
      entityLabel: getContractLabel(contract),
      message: "Contract deleted"
    });

    res.json({ message: "contract removed" });

  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

module.exports = router;
