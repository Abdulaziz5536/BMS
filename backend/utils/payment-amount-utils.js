const parsePositiveAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const getInvoicePaymentRemaining = ({ totalDue, previousPaid }) =>
  Math.max(0, Number(totalDue || 0) - Number(previousPaid || 0));

const getInvoicePaymentAmount = ({ amount, totalDue, previousPaid }) => {
  if (amount !== null && amount !== undefined) {
    return parsePositiveAmount(amount);
  }

  return parsePositiveAmount(getInvoicePaymentRemaining({ totalDue, previousPaid }));
};

const isInvoicePaymentWithinRemaining = ({
  paymentAmount,
  totalDue,
  previousPaid,
  allowOverpayment = false
}) => {
  if (allowOverpayment) {
    return true;
  }

  return Number(paymentAmount || 0) <= getInvoicePaymentRemaining({ totalDue, previousPaid }) + 0.01;
};

module.exports = {
  getInvoicePaymentAmount,
  getInvoicePaymentRemaining,
  isInvoicePaymentWithinRemaining,
  parsePositiveAmount
};
