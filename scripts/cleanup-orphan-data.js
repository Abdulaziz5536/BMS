const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
  quiet: true
});

const Building = require("../backend/models/building-model");
const Contract = require("../backend/models/contract-model");
const Floor = require("../backend/models/floor-model");
const Invoice = require("../backend/models/invoice-model");
const PaymentRecord = require("../backend/models/payment-record-model");
const Tenant = require("../backend/models/tenant-model");
const Unit = require("../backend/models/unit-model");
const Utility = require("../backend/models/utility-model");

const apply = process.argv.includes("--apply");
const yes = process.argv.includes("--yes");
const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};
const getId = (value) => String(value?._id || value || "");

const getMissingRefDocs = async (Model, refField, RefModel, filter = {}) => {
  const docs = await Model.find({
    ...filter,
    [refField]: { $exists: true, $ne: null }
  })
    .select(refField)
    .lean();
  const refIds = [...new Set(docs.map((doc) => getId(doc[refField])).filter(Boolean))];

  if (refIds.length === 0) {
    return [];
  }

  const existing = await RefModel.find({ _id: { $in: refIds } }).select("_id").lean();
  const existingSet = new Set(existing.map((doc) => getId(doc._id)));

  return docs.filter((doc) => !existingSet.has(getId(doc[refField])));
};

const deleteDocs = async (Model, docs, issues, label) => {
  if (docs.length === 0) {
    return;
  }

  issues.push({
    action: apply ? "deleted" : "would_delete",
    label,
    count: docs.length,
    sampleIds: docs.slice(0, 10).map((doc) => getId(doc._id))
  });

  if (apply) {
    await Model.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
  }
};

const deletePaymentSourceIssues = async (filter, issues) => {
  const payments = await PaymentRecord.find(filter).select("invoice contract utility").lean();
  const badPayments = payments.filter((payment) => PaymentRecord.getPaymentSourceCount(payment) !== 1);
  await deleteDocs(PaymentRecord, badPayments, issues, "payment records with invalid source");
};

const deleteSafeTenantIssues = async (filter, issues) => {
  const missingBuilding = await getMissingRefDocs(Tenant, "building", Building, filter);
  const missingUnit = await getMissingRefDocs(Tenant, "unit", Unit, filter);
  const tenantMap = new Map([...missingBuilding, ...missingUnit].map((tenant) => [getId(tenant._id), tenant]));
  const candidates = Array.from(tenantMap.values());
  const safeToDelete = [];
  const skipped = [];

  for (const tenant of candidates) {
    const usage = await Promise.all([
      Contract.countDocuments({ tenant: tenant._id }),
      Utility.countDocuments({ tenant: tenant._id }),
      Invoice.countDocuments({ tenant: tenant._id }),
      PaymentRecord.countDocuments({ tenant: tenant._id })
    ]);

    if (usage.some((count) => count > 0)) {
      skipped.push(tenant);
    } else {
      safeToDelete.push(tenant);
    }
  }

  await deleteDocs(Tenant, safeToDelete, issues, "tenants with missing building/unit and no financial records");

  if (skipped.length > 0) {
    issues.push({
      action: "review",
      label: "tenants with missing building/unit but linked financial records",
      count: skipped.length,
      sampleIds: skipped.slice(0, 10).map((tenant) => getId(tenant._id))
    });
  }
};

const main = async () => {
  if (apply && !yes) {
    throw new Error("Cleanup requires --yes with --apply");
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  const buildingId = getArgValue("building");
  if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new Error("Invalid building id");
  }

  const filter = buildingId ? { building: buildingId } : {};
  const issues = [];

  await mongoose.connect(process.env.MONGO_URI);

  await deletePaymentSourceIssues(filter, issues);
  await deleteDocs(PaymentRecord, await getMissingRefDocs(PaymentRecord, "invoice", Invoice, filter), issues, "payment records missing invoice");
  await deleteDocs(PaymentRecord, await getMissingRefDocs(PaymentRecord, "contract", Contract, filter), issues, "payment records missing contract");
  await deleteDocs(PaymentRecord, await getMissingRefDocs(PaymentRecord, "utility", Utility, filter), issues, "payment records missing utility");
  await deleteDocs(Invoice, await getMissingRefDocs(Invoice, "tenant", Tenant, filter), issues, "invoices missing tenant");
  await deleteDocs(Invoice, await getMissingRefDocs(Invoice, "contract", Contract, filter), issues, "invoices missing contract");
  await deleteDocs(Utility, await getMissingRefDocs(Utility, "tenant", Tenant, filter), issues, "utilities missing tenant");
  await deleteDocs(Contract, await getMissingRefDocs(Contract, "tenant", Tenant, filter), issues, "contracts missing tenant");
  await deleteSafeTenantIssues(filter, issues);
  await deleteDocs(Unit, await getMissingRefDocs(Unit, "floor", Floor, filter), issues, "units missing floor");
  await deleteDocs(Unit, await getMissingRefDocs(Unit, "building", Building, filter), issues, "units missing building");
  await deleteDocs(Floor, await getMissingRefDocs(Floor, "building", Building, filter), issues, "floors missing building");

  console.log(JSON.stringify({
    mode: apply ? "applied" : "dry-run",
    building: buildingId || "all",
    issueCount: issues.length,
    issues
  }, null, 2));

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
