const PaymentRecord = require("../models/payment-record-model");

const getEntityLookup = ({ invoice, contract, utility }) => {
  const lookup = {};
  if (invoice) lookup.invoice = invoice;
  if (contract) lookup.contract = contract;
  if (utility) lookup.utility = utility;
  return lookup;
};

const createPaymentRecordIfMissing = async ({
  building,
  tenant,
  invoice,
  contract,
  utility,
  amount,
  paymentDate = new Date(),
  paymentMethod = "cash",
  notes = "",
  skipExisting = true
}) => {
  const normalizedAmount = Number(amount) || 0;

  if (normalizedAmount <= 0) {
    return null;
  }

  const lookup = getEntityLookup({ invoice, contract, utility });

  if (Object.keys(lookup).length === 0) {
    return null;
  }

  if (skipExisting) {
    const existingPayment = await PaymentRecord.findOne(lookup);
    if (existingPayment) {
      return existingPayment;
    }
  }

  return PaymentRecord.create({
    building,
    tenant,
    invoice,
    contract,
    utility,
    paymentDate,
    amount: normalizedAmount,
    paymentMethod,
    notes
  });
};

const syncPaymentRecordForPaidEntity = async ({
  building,
  tenant,
  invoice,
  contract,
  utility,
  amount,
  paymentDate,
  paymentMethod,
  notes = ""
}) => {
  const normalizedAmount = Number(amount) || 0;
  const lookup = getEntityLookup({ invoice, contract, utility });

  if (Object.keys(lookup).length === 0 || normalizedAmount <= 0) {
    return { paymentRecord: null, deletedCount: 0 };
  }

  const existingPayment = await PaymentRecord.findOne(lookup).sort({ paymentDate: -1, createdAt: -1 });
  const recordPayload = {
    building,
    tenant,
    invoice,
    contract,
    utility,
    amount: normalizedAmount,
    notes
  };

  if (paymentDate || !existingPayment?.paymentDate) {
    recordPayload.paymentDate = paymentDate || new Date();
  }

  if (paymentMethod || !existingPayment?.paymentMethod) {
    recordPayload.paymentMethod = paymentMethod || "cash";
  }

  if (!existingPayment) {
    const paymentRecord = await PaymentRecord.create(recordPayload);
    return { paymentRecord, deletedCount: 0 };
  }

  Object.assign(existingPayment, recordPayload);
  await existingPayment.save();

  const duplicateDelete = await PaymentRecord.deleteMany({
    ...lookup,
    _id: { $ne: existingPayment._id }
  });

  return {
    paymentRecord: existingPayment,
    deletedCount: duplicateDelete.deletedCount || 0
  };
};

module.exports = {
  createPaymentRecordIfMissing,
  syncPaymentRecordForPaidEntity
};
