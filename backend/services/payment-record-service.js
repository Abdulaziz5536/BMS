const PaymentRecord = require("../models/payment-record-model");

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

  const lookup = {};
  if (invoice) lookup.invoice = invoice;
  if (contract) lookup.contract = contract;
  if (utility) lookup.utility = utility;

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

module.exports = {
  createPaymentRecordIfMissing
};
