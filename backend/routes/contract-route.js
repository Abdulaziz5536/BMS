const express = require('express');
const router = express.Router();
const Contract = require('../models/contract-model');
const Invoice = require('../models/invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Tenant = require('../models/tenant-model');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  applyContractStatusToInvoices,
  syncContractPaymentState
} = require('../services/payment-status-sync-service');
const {
  createPaymentRecordIfMissing,
  syncPaymentRecordForPaidEntity
} = require('../services/payment-record-service');
const { ensureRecordMatchesRequestedBuilding } = require('../utils/building-scope-utils');
const { recalculateInvoicePeriodsForContract } = require('../services/invoice-period-service');
const {
  syncPendingUtilitiesToLatestTenantInvoiceDueDate
} = require('../services/utility-invoice-sync-service');
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput,
  toIsoDate
} = require('../utils/date-utils');
const {
  CUSTOM_PAYMENT_FREQUENCY,
  getFrequencyMonths,
  normalizePaymentFrequency
} = require('../utils/payment-frequency-utils');

const MAX_FILE_DATA_LENGTH = 7000000;

// Contracts define rent amount, lease dates, and payment frequency.
// Invoice periods and payment status are derived from contract data, so edits here can affect invoices.

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

const deleteContractLinkedPaymentRecords = async (contractId) => {
  const invoices = await Invoice.find({ contract: contractId }).select("_id").lean();
  const invoiceIds = invoices.map((invoice) => invoice._id);
  const [invoicePaymentDelete, contractPaymentDelete] = await Promise.all([
    invoiceIds.length > 0
      ? PaymentRecord.deleteMany({ invoice: { $in: invoiceIds } })
      : Promise.resolve({ deletedCount: 0 }),
    PaymentRecord.deleteMany({ contract: contractId })
  ]);

  return {
    invoicePaymentRecordsDeleted: invoicePaymentDelete.deletedCount || 0,
    contractPaymentRecordsDeleted: contractPaymentDelete.deletedCount || 0,
    totalDeleted: (invoicePaymentDelete.deletedCount || 0) + (contractPaymentDelete.deletedCount || 0)
  };
};

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

    const normalizedPaymentFrequency = normalizePaymentFrequency(paymentFrequency);

    if (!normalizedPaymentFrequency || normalizedPaymentFrequency === CUSTOM_PAYMENT_FREQUENCY) {
      return res.status(400).json({ error: "Enter a valid payment frequency" });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Contract amount must be greater than zero" });
    }

    // Dates can be entered in Ethiopian-style or ISO format; normalize before saving.
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

    // A contract must belong to a tenant inside the same building.
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
      paymentFrequency: normalizedPaymentFrequency,
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

    if (contract.status === "paid") {
      await createPaymentRecordIfMissing({
        building: contract.building,
        tenant: contract.tenant,
        contract: contract._id,
        amount: contract.amount,
        notes: "Recorded from paid contract status"
      });
    }

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

    const normalizedPaymentFrequency = normalizePaymentFrequency(paymentFrequency);

    if (!normalizedPaymentFrequency || normalizedPaymentFrequency === CUSTOM_PAYMENT_FREQUENCY) {
      return res.status(400).json({ error: "Enter a valid payment frequency" });
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

    const previousContract = await Contract.findById(req.params.id);

    if (!previousContract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, previousContract, "Contract")) {
      return;
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
        paymentFrequency: normalizedPaymentFrequency,
        status: status || "pending",
        contractFile: normalizedContractFile
      },
      { returnDocument: "after" }
    );

    // If lease dates/frequency change, existing invoice periods must follow the new contract dates.
    const invoicePeriodSync = await recalculateInvoicePeriodsForContract(Invoice, updatedContract);
    const utilityDueDateSync = invoicePeriodSync.updated > 0
      ? await syncPendingUtilitiesToLatestTenantInvoiceDueDate({
          tenant: updatedContract.tenant,
          building: updatedContract.building,
          contract: updatedContract._id
        })
      : { matchedCount: 0, modifiedCount: 0 };
    await applyContractStatusToInvoices(updatedContract, updatedContract.status);

    const paymentRecordCleanup = previousContract.status === "paid" && updatedContract.status !== "paid"
      ? await deleteContractLinkedPaymentRecords(updatedContract._id)
      : { totalDeleted: 0 };
    const paymentRecordSync = updatedContract.status === "paid"
      ? await syncPaymentRecordForPaidEntity({
        building: updatedContract.building,
        tenant: updatedContract.tenant,
        contract: updatedContract._id,
        amount: updatedContract.amount,
        notes: "Recorded from paid contract status"
      })
      : { deletedCount: 0 };

    const invoicePeriodsUpdated = invoicePeriodSync.updated;
    const invoicePeriodsSkipped = invoicePeriodSync.skipped;
    const utilityDueDatesUpdated = utilityDueDateSync.modifiedCount || 0;

    await recordAuditLog({
      building: updatedContract.building,
      action: "updated",
      entityType: "contract",
      entityId: updatedContract._id,
      entityLabel: getContractLabel(updatedContract),
      message: "Contract updated",
      metadata: {
        invoicePeriodsUpdated,
        invoicePeriodsSkipped,
        utilityDueDatesUpdated,
        paymentRecordsDeleted: paymentRecordCleanup.totalDeleted + (paymentRecordSync.deletedCount || 0)
      }
    });

    return res.json({
      message: invoicePeriodsUpdated > 0
        ? `Contract updated and ${invoicePeriodsUpdated} invoice date${invoicePeriodsUpdated === 1 ? "" : "s"} updated`
        : "Contract updated",
      contract: updatedContract,
      invoicePeriodsUpdated,
      invoicePeriodsSkipped,
      utilityDueDatesUpdated
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

  // This helper is used when "pay contract" creates the next billing contract.
  if (freq === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + getFrequencyMonths(paymentFrequency));
  }

  return next;
};

router.patch('/contract/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['pending', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, contract, "Contract")) {
      return;
    }

    const previousStatus = contract.status;
    contract.status = status;
    await contract.save();

    // Manual contract status updates intentionally push that status to existing invoices.
    await applyContractStatusToInvoices(contract, status);
    await syncContractPaymentState(contract);

    const paymentRecordCleanup = previousStatus === "paid" && contract.status !== "paid"
      ? await deleteContractLinkedPaymentRecords(contract._id)
      : { totalDeleted: 0 };
    const paymentRecordSync = contract.status === "paid"
      ? await syncPaymentRecordForPaidEntity({
        building: contract.building,
        tenant: contract.tenant,
        contract: contract._id,
        amount: contract.amount,
        notes: "Recorded from paid contract status"
      })
      : { deletedCount: 0 };
    await recordAuditLog({
      building: contract.building,
      action: "status_changed",
      entityType: "contract",
      entityId: contract._id,
      entityLabel: getContractLabel(contract),
      message: `Contract status changed to ${status}`,
      metadata: {
        paymentRecordsDeleted: paymentRecordCleanup.totalDeleted + (paymentRecordSync.deletedCount || 0)
      }
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

    if (!ensureRecordMatchesRequestedBuilding(req, res, contract, "Contract")) {
      return;
    }

    if (contract.status === "paid") {
      return res.status(400).json({ error: "Contract is already paid" });
    }

    // Paying a contract closes the current cycle and creates the next pending cycle.
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

    // Create the next pending contract based on payment frequency and old lease dates.
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
      paymentFrequency: normalizePaymentFrequency(contract.paymentFrequency),
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
    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, contract, "Contract")) {
      return;
    }

    const invoices = await Invoice.find({ contract: contract._id }).select("_id").lean();
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const [invoicePaymentDelete, contractPaymentDelete, invoiceDelete] = await Promise.all([
      invoiceIds.length > 0
        ? PaymentRecord.deleteMany({ invoice: { $in: invoiceIds } })
        : Promise.resolve({ deletedCount: 0 }),
      PaymentRecord.deleteMany({ contract: contract._id }),
      Invoice.deleteMany({ contract: contract._id })
    ]);
    await Contract.deleteOne({ _id: contract._id });
    const utilitySync = await syncPendingUtilitiesToLatestTenantInvoiceDueDate({
      tenant: contract.tenant,
      building: contract.building,
      clearWhenMissing: true
    });

    await recordAuditLog({
      building: contract.building,
      action: "deleted",
      entityType: "contract",
      entityId: contract._id,
      entityLabel: getContractLabel(contract),
      message: "Contract deleted",
      metadata: {
        invoicesDeleted: invoiceDelete.deletedCount || 0,
        paymentRecordsDeleted: (invoicePaymentDelete.deletedCount || 0) + (contractPaymentDelete.deletedCount || 0),
        utilitiesUpdated: utilitySync.modifiedCount || 0
      }
    });

    res.json({ message: "contract removed" });

  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

module.exports = router;
