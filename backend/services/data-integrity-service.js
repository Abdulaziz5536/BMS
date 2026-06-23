const Building = require("../models/building-model");
const Contract = require("../models/contract-model");
const Floor = require("../models/floor-model");
const Invoice = require("../models/invoice-model");
const PaymentRecord = require("../models/payment-record-model");
const Tenant = require("../models/tenant-model");
const Unit = require("../models/unit-model");
const Utility = require("../models/utility-model");

const getId = (value) => String(value?._id || value || "");

const getChildFilter = (buildingId) => (buildingId ? { building: buildingId } : {});

const getMissingReferenceCount = async (Model, refField, RefModel, filter = {}) => {
  const records = await Model.find({
    ...filter,
    [refField]: { $exists: true, $ne: null }
  })
    .select(refField)
    .lean();
  const refIds = [...new Set(records.map((record) => getId(record[refField])).filter(Boolean))];

  if (refIds.length === 0) {
    return 0;
  }

  const existingRefs = await RefModel.find({ _id: { $in: refIds } }).select("_id").lean();
  const existingSet = new Set(existingRefs.map((record) => getId(record._id)));

  return records.filter((record) => !existingSet.has(getId(record[refField]))).length;
};

const createCheck = (name, count, message) => ({
  name,
  ok: count === 0,
  count,
  message: count === 0 ? "OK" : message
});

const getPaymentSourceIssueCount = async (filter = {}) => {
  const payments = await PaymentRecord.find(filter)
    .select("invoice contract utility")
    .lean();

  return payments.filter((payment) => PaymentRecord.getPaymentSourceCount(payment) !== 1).length;
};

const getPaidInvoiceMissingPaymentCount = async (filter = {}) => {
  const paidInvoices = await Invoice.find({ ...filter, status: "paid" }).select("_id").lean();
  const paidInvoiceIds = paidInvoices.map((invoice) => getId(invoice._id));

  if (paidInvoiceIds.length === 0) {
    return 0;
  }

  const paymentInvoiceIds = await PaymentRecord.distinct("invoice", {
    ...filter,
    invoice: { $in: paidInvoiceIds }
  });
  const paidInvoiceSet = new Set(paymentInvoiceIds.map((id) => getId(id)));

  return paidInvoiceIds.filter((id) => !paidInvoiceSet.has(id)).length;
};

const getDataIntegrityChecks = async ({ buildingId = "" } = {}) => {
  const childFilter = getChildFilter(buildingId);
  const checks = [
    createCheck(
      "Floors missing building",
      await getMissingReferenceCount(Floor, "building", Building, childFilter),
      "Some floors reference a missing building."
    ),
    createCheck(
      "Units missing building",
      await getMissingReferenceCount(Unit, "building", Building, childFilter),
      "Some units reference a missing building."
    ),
    createCheck(
      "Units missing floor",
      await getMissingReferenceCount(Unit, "floor", Floor, childFilter),
      "Some units reference a missing floor."
    ),
    createCheck(
      "Tenants missing building",
      await getMissingReferenceCount(Tenant, "building", Building, childFilter),
      "Some tenants reference a missing building."
    ),
    createCheck(
      "Tenants missing unit",
      await getMissingReferenceCount(Tenant, "unit", Unit, childFilter),
      "Some tenants reference a missing unit."
    ),
    createCheck(
      "Contracts missing tenant",
      await getMissingReferenceCount(Contract, "tenant", Tenant, childFilter),
      "Some contracts reference a missing tenant."
    ),
    createCheck(
      "Utilities missing tenant",
      await getMissingReferenceCount(Utility, "tenant", Tenant, childFilter),
      "Some utilities reference a missing tenant."
    ),
    createCheck(
      "Invoices missing tenant",
      await getMissingReferenceCount(Invoice, "tenant", Tenant, childFilter),
      "Some invoices reference a missing tenant."
    ),
    createCheck(
      "Invoices missing contract",
      await getMissingReferenceCount(Invoice, "contract", Contract, childFilter),
      "Some invoices reference a missing contract."
    ),
    createCheck(
      "Payment records with invalid source",
      await getPaymentSourceIssueCount(childFilter),
      "Some payment records do not point to exactly one invoice, contract, or utility."
    ),
    createCheck(
      "Payment records missing invoice",
      await getMissingReferenceCount(PaymentRecord, "invoice", Invoice, childFilter),
      "Some payment records reference a missing invoice."
    ),
    createCheck(
      "Payment records missing contract",
      await getMissingReferenceCount(PaymentRecord, "contract", Contract, childFilter),
      "Some payment records reference a missing contract."
    ),
    createCheck(
      "Payment records missing utility",
      await getMissingReferenceCount(PaymentRecord, "utility", Utility, childFilter),
      "Some payment records reference a missing utility."
    ),
    createCheck(
      "Paid invoices missing payment record",
      await getPaidInvoiceMissingPaymentCount(childFilter),
      "Some paid invoices do not have a payment record."
    )
  ];
  const failed = checks.filter((check) => !check.ok).length;

  return {
    ok: failed === 0,
    checkedAt: new Date().toISOString(),
    building: buildingId || "all",
    summary: {
      total: checks.length,
      failed
    },
    checks
  };
};

module.exports = {
  createCheck,
  getDataIntegrityChecks,
  getMissingReferenceCount
};
