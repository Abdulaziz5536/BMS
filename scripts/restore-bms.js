const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
  quiet: true
});

const AuditLog = require("../backend/models/audit-log-model");
const Building = require("../backend/models/building-model");
const Contract = require("../backend/models/contract-model");
const Employee = require("../backend/models/employees-model");
const Floor = require("../backend/models/floor-model");
const Invoice = require("../backend/models/invoice-model");
const PaymentRecord = require("../backend/models/payment-record-model");
const Tenant = require("../backend/models/tenant-model");
const Unit = require("../backend/models/unit-model");
const Utility = require("../backend/models/utility-model");

const apply = process.argv.includes("--apply");
const yes = process.argv.includes("--yes");
const selfTest = process.argv.includes("--self-test");
const backupPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

const collections = [
  ["buildings", Building],
  ["floors", Floor],
  ["units", Unit],
  ["tenants", Tenant],
  ["employees", Employee],
  ["contracts", Contract],
  ["utilities", Utility],
  ["invoices", Invoice],
  ["paymentRecords", PaymentRecord],
  ["auditLogs", AuditLog]
];

const validateBackup = (parsed) => {
  if (parsed.schemaVersion !== 1 || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("Backup file is not a supported BMS backup");
  }

  for (const [name] of collections) {
    if (!Array.isArray(parsed.data[name])) {
      throw new Error(`Backup is missing data.${name}`);
    }
  }

  return parsed;
};

const decryptBackupPayload = (parsed) => {
  if (!parsed?.encrypted) {
    return parsed;
  }

  if (parsed.algorithm !== "aes-256-gcm") {
    throw new Error("Encrypted backup uses an unsupported algorithm");
  }

  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    throw new Error("BACKUP_ENCRYPTION_KEY is required to restore this encrypted backup");
  }

  const key = crypto.createHash("sha256").update(process.env.BACKUP_ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(decrypted);
};

const createEmptyBackup = () => ({
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  building: "self-test",
  counts: Object.fromEntries(collections.map(([name]) => [name, 0])),
  data: Object.fromEntries(collections.map(([name]) => [name, []]))
});

const readBackup = () => {
  if (selfTest) {
    return validateBackup(createEmptyBackup());
  }

  if (!backupPath) {
    throw new Error("Usage: node scripts/restore-bms.js <backup.json|backup.json.enc> [--apply --yes]");
  }

  const parsed = JSON.parse(fs.readFileSync(path.resolve(backupPath), "utf8"));
  return validateBackup(decryptBackupPayload(parsed));
};

const main = async () => {
  const backup = readBackup();
  const counts = Object.fromEntries(
    collections.map(([name]) => [name, backup.data[name].length])
  );

  if (selfTest) {
    console.log(JSON.stringify({
      mode: "self-test",
      message: "Restore validation self-test passed.",
      counts
    }, null, 2));
    return;
  }

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      message: "Backup is readable. Re-run with --apply --yes to replace current data.",
      counts
    }, null, 2));
    return;
  }

  if (!yes) {
    throw new Error("Restore requires --yes with --apply");
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  for (const [, Model] of [...collections].reverse()) {
    await Model.deleteMany({});
  }

  for (const [name, Model] of collections) {
    if (backup.data[name].length > 0) {
      await Model.insertMany(backup.data[name], { ordered: false });
    }
  }

  console.log(JSON.stringify({
    mode: "applied",
    message: "Restore completed",
    counts
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
