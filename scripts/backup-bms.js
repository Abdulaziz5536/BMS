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

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};

const shouldEncryptBackup = () =>
  process.argv.includes("--encrypt") || Boolean(process.env.BACKUP_ENCRYPTION_KEY);

const getBackupPath = (encrypted = false) => {
  const explicitOutput = getArgValue("out");
  if (explicitOutput) {
    return path.resolve(explicitOutput);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(__dirname, "..", "backups", `bms-backup-${stamp}.json${encrypted ? ".enc" : ""}`);
};

const getRetentionCount = () => {
  const value = getArgValue("keep") || process.env.BACKUP_KEEP || "30";
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 30;
};

const encryptBackupPayload = (payload) => {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY is required when backup encryption is enabled");
  }

  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secret).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final()
  ]);

  return JSON.stringify({
    encrypted: true,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  }, null, 2);
};

const rotateBackups = (outputPath, keepCount) => {
  if (keepCount === 0) {
    return [];
  }

  const backupDir = path.dirname(outputPath);
  const removed = [];

  if (!fs.existsSync(backupDir)) {
    return removed;
  }

  const backupFiles = fs.readdirSync(backupDir)
    .filter((file) => /^bms-backup-.*\.json(\.enc)?$/.test(file))
    .map((file) => {
      const fullPath = path.join(backupDir, file);
      return {
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  backupFiles.slice(keepCount).forEach((file) => {
    fs.unlinkSync(file.fullPath);
    removed.push(file.fullPath);
  });

  return removed;
};

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

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  const buildingId = getArgValue("building");
  if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new Error("Invalid building id");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const data = {};
  for (const [name, Model] of collections) {
    const filter = buildingId
      ? name === "buildings"
        ? { _id: buildingId }
        : { building: buildingId }
      : {};
    data[name] = await Model.find(filter).lean();
  }

  const counts = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value.length])
  );
  const encrypted = shouldEncryptBackup();
  const outputPath = getBackupPath(encrypted);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const payload = JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    building: buildingId || "all",
    counts,
    data
  }, null, 2);
  fs.writeFileSync(outputPath, encrypted ? encryptBackupPayload(payload) : payload);

  const removedBackups = rotateBackups(outputPath, getRetentionCount());

  console.log(JSON.stringify({ outputPath, encrypted, counts, removedBackups }, null, 2));
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
