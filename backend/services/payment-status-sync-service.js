const Contract = require("../models/contract-model");
const Invoice = require("../models/invoice-model");

const ACTIVE_INVOICE_FILTER = { status: { $ne: "cancelled" } };

// Payment-status sync is the single place that translates between contract status
// and invoice fields. Keeping this centralized prevents paid/pending drift.

const getInvoiceTotal = (invoice) =>
  Number(invoice.totalAmount || invoice.rentAmount || 0);

const isInvoicePaid = (invoice) =>
  invoice.status === "paid" || Number(invoice.outstandingBalance || 0) <= 0;

const resolveContract = async (contractOrId) => {
  if (!contractOrId) {
    return null;
  }

  if (typeof contractOrId.save === "function") {
    return contractOrId;
  }

  return Contract.findById(contractOrId._id || contractOrId);
};

const setInvoiceStatusFields = (invoice, status, options = {}) => {
  // Update all payment-related invoice fields together, not only the status string.
  const total = getInvoiceTotal(invoice);

  if (status === "paid") {
    invoice.status = "paid";
    invoice.amountPaid = Math.max(Number(invoice.amountPaid || 0), total);
    invoice.outstandingBalance = 0;
    invoice.paymentDate = invoice.paymentDate || new Date();
    return invoice;
  }

  if (status === "pending") {
    invoice.status = "pending";

    if (options.resetPaidAmount || Number(invoice.amountPaid || 0) >= total) {
      invoice.amountPaid = 0;
      invoice.outstandingBalance = total;
      invoice.paymentDate = undefined;
    } else {
      invoice.outstandingBalance = Math.max(0, total - Number(invoice.amountPaid || 0));
    }
  }

  return invoice;
};

const getNewInvoicePaymentFields = (totalAmount) => {
  // Fresh generated invoices must start unpaid even if the previous period was paid.
  const total = Number(totalAmount || 0);

  return {
    amountPaid: 0,
    outstandingBalance: total,
    status: "pending"
  };
};

const getContractInvoices = async (contractId) => {
  return Invoice.find({ contract: contractId, ...ACTIVE_INVOICE_FILTER });
};

const applyContractStatusToInvoices = async (contractOrId, status) => {
  // Manual contract status changes intentionally apply to every active invoice.
  const contract = await resolveContract(contractOrId);

  if (!contract || !["pending", "paid"].includes(status)) {
    return { updated: 0 };
  }

  const invoices = await getContractInvoices(contract._id);
  let updated = 0;

  for (const invoice of invoices) {
    const previous = {
      status: invoice.status,
      amountPaid: Number(invoice.amountPaid || 0),
      outstandingBalance: Number(invoice.outstandingBalance || 0),
      paymentDate: invoice.paymentDate ? String(invoice.paymentDate) : ""
    };

    setInvoiceStatusFields(invoice, status, { resetPaidAmount: status === "pending" });

    const changed =
      previous.status !== invoice.status ||
      previous.amountPaid !== Number(invoice.amountPaid || 0) ||
      previous.outstandingBalance !== Number(invoice.outstandingBalance || 0) ||
      previous.paymentDate !== (invoice.paymentDate ? String(invoice.paymentDate) : "");

    if (changed) {
      await invoice.save();
      updated += 1;
    }
  }

  return { updated };
};

const syncContractPaymentState = async (contractOrId) => {
  return syncContractStatusFromInvoices(contractOrId);
};

const syncContractStatusFromInvoices = async (contractOrId) => {
  // Contract is paid only when every active invoice is paid.
  const contract = await resolveContract(contractOrId);

  if (!contract) {
    return null;
  }

  const invoices = await getContractInvoices(contract._id);

  if (invoices.length === 0) {
    return contract;
  }

  const nextStatus = invoices.every(isInvoicePaid) ? "paid" : "pending";

  if (contract.status !== nextStatus) {
    contract.status = nextStatus;
    await contract.save();
  }

  return contract;
};

module.exports = {
  applyContractStatusToInvoices,
  getNewInvoicePaymentFields,
  setInvoiceStatusFields,
  syncContractPaymentState,
  syncContractStatusFromInvoices
};
