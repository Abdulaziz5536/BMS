const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
  quiet: true
});

const Building = require("../backend/models/building-model");
const Invoice = require("../backend/models/invoice-model");
const PaymentRecord = require("../backend/models/payment-record-model");
const Tenant = require("../backend/models/tenant-model");
const Unit = require("../backend/models/unit-model");
const User = require("../backend/models/auth-model");

const COLLATION_CI = { locale: "en", strength: 2 };

const normalizedTextExpression = (field) => ({
  $toLower: {
    $trim: {
      input: { $ifNull: [`$${field}`, ""] }
    }
  }
});

const findDuplicateGroups = async (Model, name, groupId) => {
  const duplicates = await Model.aggregate([
    {
      $project: {
        groupId,
        original: "$$ROOT"
      }
    },
    { $match: { groupId: { $ne: null } } },
    {
      $group: {
        _id: "$groupId",
        count: { $sum: 1 },
        ids: { $push: "$original._id" }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]);

  return duplicates.map((duplicate) => ({
    collection: name,
    key: duplicate._id,
    count: duplicate.count,
    ids: duplicate.ids.map(String)
  }));
};

const sameIndexKey = (left, right) =>
  JSON.stringify(left || {}) === JSON.stringify(right || {});

const sameOptionalObject = (left, right) =>
  JSON.stringify(left || {}) === JSON.stringify(right || {});

const hasCompatibleOptions = (existing, options = {}) => {
  if (Boolean(existing.unique) !== Boolean(options.unique)) {
    return false;
  }

  if (Boolean(existing.sparse) !== Boolean(options.sparse)) {
    return false;
  }

  if (!sameOptionalObject(existing.partialFilterExpression, options.partialFilterExpression)) {
    return false;
  }

  if (options.collation) {
    return (
      existing.collation?.locale === options.collation.locale &&
      existing.collation?.strength === options.collation.strength
    );
  }

  return true;
};

const getDuplicateChecks = async () => {
  const checks = await Promise.all([
    findDuplicateGroups(Building, "buildings.name", normalizedTextExpression("name")),
    findDuplicateGroups(User, "users.email", normalizedTextExpression("email")),
    findDuplicateGroups(Tenant, "tenants.building+email", {
      $cond: [
        { $gt: [{ $strLenCP: { $ifNull: ["$email", ""] } }, 0] },
        {
          building: "$building",
          value: normalizedTextExpression("email")
        },
        null
      ]
    }),
    findDuplicateGroups(Unit, "units.building+unitId", {
      building: "$building",
      value: normalizedTextExpression("unitId")
    }),
    findDuplicateGroups(PaymentRecord, "paymentRecords.receiptNumber", {
      $cond: [
        { $gt: [{ $strLenCP: { $ifNull: ["$receiptNumber", ""] } }, 0] },
        "$receiptNumber",
        null
      ]
    }),
    findDuplicateGroups(PaymentRecord, "paymentRecords.fsNumber", {
      $cond: [
        { $gt: [{ $strLenCP: { $ifNull: ["$fsNumber", ""] } }, 0] },
        "$fsNumber",
        null
      ]
    }),
    findDuplicateGroups(PaymentRecord, "paymentRecords.building+idempotencyKey", {
      $cond: [
        { $gt: [{ $strLenCP: { $ifNull: ["$idempotencyKey", ""] } }, 0] },
        { building: "$building", value: "$idempotencyKey" },
        null
      ]
    })
  ]);

  return checks.flat();
};

const createIndexes = async () => {
  const created = [];
  const addIndex = async (Model, spec, options) => {
    const existingIndexes = await Model.collection.indexes();
    const sameKeyIndex = existingIndexes.find((index) => sameIndexKey(index.key, spec));

    if (sameKeyIndex) {
      if (hasCompatibleOptions(sameKeyIndex, options)) {
        created.push(`${sameKeyIndex.name} (existing)`);
        return;
      }

      await Model.collection.dropIndex(sameKeyIndex.name);
      created.push(`${sameKeyIndex.name} (replaced)`);
    }

    const name = await Model.collection.createIndex(spec, options);
    created.push(name);
  };

  await addIndex(Building, { name: 1 }, {
    unique: true,
    collation: COLLATION_CI,
    name: "uniq_building_name_ci"
  });
  await addIndex(User, { email: 1 }, {
    unique: true,
    collation: COLLATION_CI,
    name: "uniq_user_email_ci"
  });
  await addIndex(Unit, { building: 1, unitId: 1 }, {
    unique: true,
    collation: COLLATION_CI,
    name: "uniq_unit_building_unitid_ci"
  });
  await addIndex(Tenant, { building: 1, email: 1 }, {
    unique: true,
    partialFilterExpression: { email: { $type: "string", $gt: "" } },
    collation: COLLATION_CI,
    name: "uniq_tenant_building_email_ci"
  });
  await addIndex(Invoice, { contract: 1, periodStart: 1, periodEnd: 1 }, {
    unique: true,
    name: "uniq_invoice_contract_period"
  });
  await addIndex(PaymentRecord, { receiptNumber: 1 }, {
    unique: true,
    sparse: true,
    name: "uniq_payment_receipt_number"
  });
  await addIndex(PaymentRecord, { fsNumber: 1 }, {
    unique: true,
    sparse: true,
    name: "uniq_payment_fs_number"
  });
  await addIndex(PaymentRecord, { building: 1, idempotencyKey: 1 }, {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } },
    name: "uniq_payment_building_idempotency"
  });

  return created;
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const duplicates = await getDuplicateChecks();
  if (duplicates.length > 0) {
    console.error(JSON.stringify({ error: "Duplicate data must be fixed before indexes can be created", duplicates }, null, 2));
    process.exitCode = 1;
    return;
  }

  const indexes = await createIndexes();
  console.log(JSON.stringify({ indexesCreatedOrConfirmed: indexes }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
