const parsePositiveAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const getInvoicePaymentAmount = ({ amount, totalDue, previousPaid }) => {
  if (amount !== null && amount !== undefined) {
    return parsePositiveAmount(amount);
  }

  return parsePositiveAmount(Math.max(0, Number(totalDue || 0) - Number(previousPaid || 0)));
};

module.exports = {
  getInvoicePaymentAmount,
  parsePositiveAmount
};
