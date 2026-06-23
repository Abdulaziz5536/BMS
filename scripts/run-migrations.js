const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
  quiet: true
});

const Employee = require("../backend/models/employees-model");
const Migration = require("../backend/models/migration-model");
const PaymentRecord = require("../backend/models/payment-record-model");
const Tenant = require("../backend/models/tenant-model");
const User = require("../backend/models/auth-model");
const {
  formatFsNumber,
  formatReceiptNumber
} = require("../backend/utils/receipt-number-utils");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const updateNormalizedEmail = async (Model, label) => {
  const records = await Model.find({ email: { $type: "string", $ne: "" } });
  let updated = 0;

  for (const record of records) {
    const normalizedEmail = normalizeEmail(record.email);

    if (record.email !== normalizedEmail) {
      record.email = normalizedEmail;
      await record.save();
      updated += 1;
    }
  }

  return { label, scanned: records.length, updated };
};

const backfillPaymentIdentity = async () => {
  const payments = await PaymentRecord.find({
    $or: [
      { receiptNumber: { $in: [null, ""] } },
      { fsNumber: { $in: [null, ""] } },
      { paymentKind: { $exists: false } },
      { receiptSnapshot: { $in: [null, {}] } }
    ]
  });
  let updated = 0;

  for (const payment of payments) {
    if (!payment.receiptNumber) {
      payment.receiptNumber = formatReceiptNumber(payment);
    }

    if (!payment.fsNumber) {
      payment.fsNumber = formatFsNumber(payment);
    }

    if (payment.contract) {
      payment.paymentKind = "contract";
    } else if (payment.utility) {
      payment.paymentKind = "utility";
    } else {
      payment.paymentKind = "rent";
    }

    payment.receiptSnapshot = {
      ...(payment.receiptSnapshot || {}),
      receiptNumber: payment.receiptNumber,
      fsNumber: payment.fsNumber,
      paymentKind: payment.paymentKind,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod
    };

    await payment.save();
    updated += 1;
  }

  return { scanned: payments.length, updated };
};

const migrations = [
  {
    migrationId: "2026-06-23-normalize-emails",
    description: "Normalize stored user, tenant, and employee email casing before CI indexes.",
    run: async () => ({
      users: await updateNormalizedEmail(User, "users"),
      tenants: await updateNormalizedEmail(Tenant, "tenants"),
      employees: await updateNormalizedEmail(Employee, "employees")
    })
  },
  {
    migrationId: "2026-06-23-payment-receipt-identity",
    description: "Backfill stable receipt numbers, FS numbers, payment kind, and receipt snapshots.",
    run: backfillPaymentIdentity
  }
];

const runMigration = async (migration) => {
  const existing = await Migration.findOne({ migrationId: migration.migrationId });

  if (existing) {
    return { migrationId: migration.migrationId, status: "skipped" };
  }

  const result = await migration.run();

  await Migration.create({
    migrationId: migration.migrationId,
    description: migration.description,
    result
  });

  return { migrationId: migration.migrationId, status: "applied", result };
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const results = [];
  for (const migration of migrations) {
    results.push(await runMigration(migration));
  }

  console.log(JSON.stringify({ migrations: results }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
