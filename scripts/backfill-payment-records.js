const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
  quiet: true
});

const Building = require("../backend/models/building-model");
const Contract = require("../backend/models/contract-model");
const Invoice = require("../backend/models/invoice-model");
const PaymentRecord = require("../backend/models/payment-record-model");
const Utility = require("../backend/models/utility-model");
require("../backend/models/tenant-model");

const apply = process.argv.includes("--apply");

const getUtilityTotal = (utility) =>
  (Number(utility.waterAmount) || 0) +
  (Number(utility.lightAmount) || 0) +
  (Number(utility.generatorGasAmount) || 0);

const getInvoiceBackfillAmount = (invoice) => {
  const amountPaid = Number(invoice.amountPaid || 0);
  if (amountPaid > 0) return amountPaid;
  return Number(invoice.totalAmount || invoice.rentAmount || 0);
};

const hasPayment = async (filter) => Boolean(await PaymentRecord.exists(filter));

const createPayment = async (payload) => {
  if (!apply) {
    return null;
  }

  return PaymentRecord.create(payload);
};

const summarizeItem = (type, item, amount, buildingName, tenantName, reason) => ({
  type,
  id: String(item._id),
  building: buildingName || String(item.building || ""),
  tenant: tenantName || "",
  amount,
  paymentDate: item.paymentDate || item.updatedAt || item.createdAt || null,
  reason
});

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const buildings = await Building.find().lean();
  const buildingNames = new Map(buildings.map((building) => [
    String(building._id),
    building.name
  ]));
  const planned = [];
  const plannedInvoicePaymentIds = new Set();
  let skippedMissingBuilding = 0;

  const paidInvoices = await Invoice.find({ status: "paid" })
    .populate("tenant", "tenantName")
    .lean();

  for (const invoice of paidInvoices) {
    if (!invoice.building) {
      skippedMissingBuilding += 1;
      continue;
    }

    if (await hasPayment({ invoice: invoice._id })) {
      continue;
    }

    const amount = getInvoiceBackfillAmount(invoice);
    if (amount <= 0) {
      continue;
    }

    planned.push(summarizeItem(
      "invoice",
      invoice,
      amount,
      buildingNames.get(String(invoice.building)),
      invoice.tenant?.tenantName,
      "paid invoice without payment record"
    ));
    plannedInvoicePaymentIds.add(String(invoice._id));

    await createPayment({
      building: invoice.building,
      tenant: invoice.tenant?._id || invoice.tenant,
      invoice: invoice._id,
      paymentDate: invoice.paymentDate || invoice.updatedAt || invoice.createdAt || new Date(),
      amount,
      paymentMethod: "cash",
      notes: "Backfilled from old paid invoice status"
    });
  }

  const paidContracts = await Contract.find({ status: "paid" })
    .populate("tenant", "tenantName")
    .lean();

  for (const contract of paidContracts) {
    if (!contract.building) {
      skippedMissingBuilding += 1;
      continue;
    }

    if (await hasPayment({ contract: contract._id })) {
      continue;
    }

    const activeInvoices = await Invoice.find({
      contract: contract._id,
      status: { $ne: "cancelled" }
    }).select("_id status").lean();

    const activeInvoiceIds = activeInvoices.map((invoice) => invoice._id);
    const hasPlannedInvoicePayment = activeInvoiceIds.some((invoiceId) =>
      plannedInvoicePaymentIds.has(String(invoiceId))
    );
    const hasInvoicePayment = activeInvoices.length > 0 && (
      hasPlannedInvoicePayment ||
      await PaymentRecord.exists({ invoice: { $in: activeInvoiceIds } })
    );

    if (hasInvoicePayment) {
      planned.push(summarizeItem(
        "contract-skip",
        contract,
        0,
        buildingNames.get(String(contract.building)),
        contract.tenant?.tenantName,
        "skipped because a linked invoice already has a payment record"
      ));
      continue;
    }

    const amount = Number(contract.amount || 0);
    if (amount <= 0) {
      continue;
    }

    planned.push(summarizeItem(
      "contract",
      contract,
      amount,
      buildingNames.get(String(contract.building)),
      contract.tenant?.tenantName,
      "paid contract without payment record"
    ));

    await createPayment({
      building: contract.building,
      tenant: contract.tenant?._id || contract.tenant,
      contract: contract._id,
      paymentDate: contract.updatedAt || contract.createdAt || new Date(),
      amount,
      paymentMethod: "cash",
      notes: "Backfilled from old paid contract status"
    });
  }

  const paidUtilities = await Utility.find({ status: "paid" })
    .populate("tenant", "tenantName")
    .lean();

  for (const utility of paidUtilities) {
    if (!utility.building) {
      skippedMissingBuilding += 1;
      continue;
    }

    if (await hasPayment({ utility: utility._id })) {
      continue;
    }

    const amount = getUtilityTotal(utility);
    if (amount <= 0) {
      continue;
    }

    planned.push(summarizeItem(
      "utility",
      utility,
      amount,
      buildingNames.get(String(utility.building)),
      utility.tenant?.tenantName,
      "paid utility without payment record"
    ));

    await createPayment({
      building: utility.building,
      tenant: utility.tenant?._id || utility.tenant,
      utility: utility._id,
      paymentDate: utility.updatedAt || utility.createdAt || new Date(),
      amount,
      paymentMethod: "cash",
      notes: "Backfilled from old paid utility status"
    });
  }

  const createCount = planned.filter((item) => !item.type.endsWith("-skip")).length;
  const skipCount = planned.length - createCount;

  console.log(JSON.stringify({
    mode: apply ? "applied" : "dry-run",
    createCount,
    skipCount,
    skippedMissingBuilding,
    totalAmount: planned.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    items: planned
  }, null, 2));

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
