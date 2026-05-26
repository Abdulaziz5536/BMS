const { parseFlexibleDateInput } = require("./date-utils");

const LATE_PENALTY_RATE = 0.10;

// Current business rule: once payment is after the due date, add a fixed 10% penalty.
const calculateLatePenalty = (dueDate, paymentDate, rentAmount) => {
  const due = parseFlexibleDateInput(dueDate);
  const paid = parseFlexibleDateInput(paymentDate);

  if (!due || !paid || paid <= due) {
    return 0;
  }

  return Math.round((Number(rentAmount) || 0) * LATE_PENALTY_RATE);
};

module.exports = {
  LATE_PENALTY_RATE,
  calculateLatePenalty
};
