const Contract = require("../models/contract-model");
const Invoice = require("../models/invoice-model");
const RentInvoice = require("../models/rent-invoice-model");

const ACTIVE_INVOICE_FILTER = { status: { $ne: "cancelled" } };

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

const getInvoiceFieldsForContractStatus = (contract, totalAmount) => {
  const total = Number(totalAmount || 0);

  if (contract.status === "paid") {
    return {
      amountPaid: total,
      outstandingBalance: 0,
      status: "paid",
      paymentDate: new Date()
    };
  }

  return {
    amountPaid: 0,
    outstandingBalance: total,
    status: "pending"
  };
};

const getContractInvoices = async (contractId) => {
  const [invoices, rentInvoices] = await Promise.all([
    Invoice.find({ contract: contractId, ...ACTIVE_INVOICE_FILTER }),
    RentInvoice.find({ contract: contractId, ...ACTIVE_INVOICE_FILTER })
  ]);

  return [...invoices, ...rentInvoices];
};

const applyContractStatusToInvoices = async (contractOrId, status) => {
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
  const contract = await resolveContract(contractOrId);

  if (!contract) {
    return null;
  }

  const invoices = await getContractInvoices(contract._id);

  if (invoices.length === 0) {
    return contract;
  }

  const allInvoicesPaid = invoices.every(isInvoicePaid);

  if (contract.status === "paid" && !allInvoicesPaid) {
    await applyContractStatusToInvoices(contract, "paid");
    return contract;
  }

  const nextStatus = allInvoicesPaid ? "paid" : "pending";

  if (contract.status !== nextStatus) {
    contract.status = nextStatus;
    await contract.save();
  }

  return contract;
};

const syncContractStatusFromInvoices = async (contractOrId) => {
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
  getInvoiceFieldsForContractStatus,
  setInvoiceStatusFields,
  syncContractPaymentState,
  syncContractStatusFromInvoices
};
