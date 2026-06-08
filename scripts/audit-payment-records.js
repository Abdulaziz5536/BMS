const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
  quiet: true
});

const Contract = require("../backend/models/contract-model");
const Invoice = require("../backend/models/invoice-model");
const PaymentRecord = require("../backend/models/payment-record-model");
const Utility = require("../backend/models/utility-model");
require("../backend/models/building-model");
require("../backend/models/tenant-model");

const apply = process.argv.includes("--apply");
const EPSILON = 0.01;

const getUtilityTotal = (utility) =>
  (Number(utility.waterAmount) || 0) +
  (Number(utility.lightAmount) || 0) +
  (Number(utility.generatorGasAmount) || 0);

const getInvoiceExpectedPaidAmount = (invoice) => {
  const amountPaid = Number(invoice.amountPaid || 0);
  if (amountPaid > 0) return amountPaid;
  return Number(invoice.totalAmount || invoice.rentAmount || 0);
};

const moneyDiffers = (left, right) =>
  Math.abs((Number(left) || 0) - (Number(right) || 0)) > EPSILON;

const getPaymentKind = (payment) => {
  const refs = ["invoice", "contract", "utility"].filter((field) => payment[field]);
  if (refs.length === 0) return "unlinked";
  if (refs.length > 1) return "ambiguous";
  return refs[0];
};

const getEntityKey = (kind, id) => `${kind}:${String(id)}`;

const getPaymentTime = (payment) => {
  const date = payment.paymentDate || payment.createdAt || payment.updatedAt;
  return date ? new Date(date).getTime() : 0;
};

const getDuplicatePayments = (payments) => {
  const grouped = new Map();

  payments.forEach((payment) => {
    const kind = getPaymentKind(payment);
    if (!["contract", "utility"].includes(kind)) {
      return;
    }

    const key = getEntityKey(kind, payment[kind]);
    grouped.set(key, [...(grouped.get(key) || []), payment]);
  });

  return Array.from(grouped.values()).flatMap((group) => {
    if (group.length <= 1) return [];
    const sorted = [...group].sort((a, b) => getPaymentTime(b) - getPaymentTime(a));
    return sorted.slice(1);
  });
};

const updatePaymentAmount = async (payment, expectedAmount, issues, reason) => {
  issues.push({
    action: apply ? "updated_amount" : "would_update_amount",
    paymentId: String(payment._id),
    amount: payment.amount,
    expectedAmount,
    reason
  });

  if (apply) {
    payment.amount = expectedAmount;
    await payment.save();
  }
};

const deletePayment = async (payment, issues, reason) => {
  issues.push({
    action: apply ? "deleted" : "would_delete",
    paymentId: String(payment._id),
    amount: payment.amount,
    reason
  });

  if (apply) {
    await PaymentRecord.deleteOne({ _id: payment._id });
  }
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const payments = await PaymentRecord.find()
    .sort({ paymentDate: -1, createdAt: -1 });
  const issues = [];
  const duplicateIds = new Set(getDuplicatePayments(payments).map((payment) => String(payment._id)));

  for (const payment of payments) {
    const kind = getPaymentKind(payment);

    if (kind === "unlinked") {
      await deletePayment(payment, issues, "payment record has no invoice, contract, or utility link");
      continue;
    }

    if (kind === "ambiguous") {
      issues.push({
        action: "review",
        paymentId: String(payment._id),
        amount: payment.amount,
        reason: "payment record has more than one entity link"
      });
      continue;
    }

    if (duplicateIds.has(String(payment._id))) {
      await deletePayment(payment, issues, `duplicate ${kind} payment record`);
      continue;
    }

    if (kind === "invoice") {
      const invoice = await Invoice.findById(payment.invoice);
      if (!invoice) {
        await deletePayment(payment, issues, "linked invoice no longer exists");
        continue;
      }

      if (invoice.status === "cancelled") {
        await deletePayment(payment, issues, "linked invoice is cancelled");
        continue;
      }

      const expectedAmount = getInvoiceExpectedPaidAmount(invoice);
      if (expectedAmount <= 0) {
        await deletePayment(payment, issues, "linked invoice has no paid amount");
        continue;
      }

      const invoicePaymentCount = payments.filter((item) =>
        item.invoice && String(item.invoice) === String(invoice._id)
      ).length;

      if (invoicePaymentCount === 1 && moneyDiffers(payment.amount, expectedAmount)) {
        await updatePaymentAmount(payment, expectedAmount, issues, "single invoice payment amount differs from invoice paid amount");
      }
      continue;
    }

    if (kind === "contract") {
      const contract = await Contract.findById(payment.contract);
      if (!contract) {
        await deletePayment(payment, issues, "linked contract no longer exists");
        continue;
      }

      if (contract.status !== "paid") {
        await deletePayment(payment, issues, "linked contract is not paid");
        continue;
      }

      const expectedAmount = Number(contract.amount || 0);
      if (moneyDiffers(payment.amount, expectedAmount)) {
        await updatePaymentAmount(payment, expectedAmount, issues, "contract payment amount differs from contract amount");
      }
      continue;
    }

    if (kind === "utility") {
      const utility = await Utility.findById(payment.utility);
      if (!utility) {
        await deletePayment(payment, issues, "linked utility no longer exists");
        continue;
      }

      if (utility.status !== "paid") {
        await deletePayment(payment, issues, "linked utility is not paid");
        continue;
      }

      const expectedAmount = getUtilityTotal(utility);
      if (moneyDiffers(payment.amount, expectedAmount)) {
        await updatePaymentAmount(payment, expectedAmount, issues, "utility payment amount differs from utility total");
      }
    }
  }

  const summary = issues.reduce((counts, issue) => {
    counts[issue.action] = (counts[issue.action] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    mode: apply ? "applied" : "dry-run",
    checked: payments.length,
    issueCount: issues.length,
    summary,
    issues
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
