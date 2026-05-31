const Invoice = require("../models/invoice-model");
const Utility = require("../models/utility-model");
const {
  parseFlexibleDateInput,
  toIsoDate
} = require("../utils/date-utils");

const ACTIVE_INVOICE_FILTER = { status: { $ne: "cancelled" } };

const normalizeDueDateValue = (value) => {
  const date = parseFlexibleDateInput(value);
  return date ? toIsoDate(date) : "";
};

const getInvoiceTenant = (invoice) => invoice?.tenant?._id || invoice?.tenant;
const getInvoiceBuilding = (invoice) => invoice?.building?._id || invoice?.building;

const findTenantInvoiceForUtility = async ({
  tenant,
  building,
  afterDate
}) => {
  if (!tenant) {
    return null;
  }

  const filter = {
    tenant,
    ...ACTIVE_INVOICE_FILTER
  };

  if (building) {
    filter.building = building;
  }

  const parsedAfterDate = afterDate ? parseFlexibleDateInput(afterDate) : null;

  if (parsedAfterDate) {
    const nextInvoice = await Invoice.findOne({
      ...filter,
      dueDate: { $gt: parsedAfterDate }
    })
      .sort({ dueDate: 1, createdAt: 1 })
      .lean();

    if (nextInvoice) {
      return nextInvoice;
    }
  }

  return Invoice.findOne(filter)
    .sort({ dueDate: -1, createdAt: -1 })
    .lean();
};

const getSyncedUtilityDueDate = async ({
  tenant,
  building,
  fallbackDueDate = "",
  afterDate = ""
}) => {
  const invoice = await findTenantInvoiceForUtility({
    tenant,
    building,
    afterDate
  });

  return normalizeDueDateValue(invoice?.dueDate) || normalizeDueDateValue(fallbackDueDate);
};

const syncPendingUtilitiesToInvoiceDueDate = async (invoice) => {
  const tenant = getInvoiceTenant(invoice);
  const dueDate = normalizeDueDateValue(invoice?.dueDate);

  if (!tenant || !dueDate) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const filter = {
    tenant,
    status: "pending"
  };
  const building = getInvoiceBuilding(invoice);

  if (building) {
    filter.building = building;
  }

  return Utility.updateMany(filter, { $set: { dueDate } });
};

const syncPendingUtilitiesToLatestTenantInvoiceDueDate = async ({
  tenant,
  building,
  contract
}) => {
  const filter = {
    tenant,
    ...ACTIVE_INVOICE_FILTER
  };

  if (!tenant) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  if (building) {
    filter.building = building;
  }

  if (contract) {
    filter.contract = contract;
  }

  const invoice = await Invoice.findOne(filter).sort({ dueDate: -1, createdAt: -1 });

  if (!invoice) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  return syncPendingUtilitiesToInvoiceDueDate(invoice);
};

module.exports = {
  getSyncedUtilityDueDate,
  normalizeDueDateValue,
  syncPendingUtilitiesToInvoiceDueDate,
  syncPendingUtilitiesToLatestTenantInvoiceDueDate
};
