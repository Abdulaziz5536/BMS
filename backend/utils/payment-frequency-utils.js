const CUSTOM_PAYMENT_FREQUENCY = "Custom";

const getEveryMonths = (paymentFrequency) => {
  const value = String(paymentFrequency || "").trim().toLowerCase();
  const match = value.match(/^every\s+(\d+)\s+months?$/);

  if (!match) {
    return null;
  }

  const months = Number(match[1]);
  return Number.isInteger(months) && months > 0 ? months : null;
};

const getFrequencyMonths = (paymentFrequency, { yearlyMonths = 12 } = {}) => {
  const value = String(paymentFrequency || "").trim().toLowerCase();
  const everyMonths = getEveryMonths(value);

  if (everyMonths) {
    return everyMonths;
  }

  if (value === "monthly") {
    return 1;
  }

  if (value === "quarterly" || value === "quartely") {
    return 3;
  }

  if (value === "yearly") {
    return yearlyMonths;
  }

  return 1;
};

const normalizePaymentFrequency = (paymentFrequency) => {
  const raw = String(paymentFrequency || "").trim();
  const value = raw.toLowerCase();
  const everyMonths = getEveryMonths(value);

  if (!raw) {
    return "";
  }

  if (value === "monthly" || everyMonths === 1) {
    return "Monthly";
  }

  if (value === "quarterly" || value === "quartely" || everyMonths === 3) {
    return "Every 3 months";
  }

  if (everyMonths === 6) {
    return "Every 6 months";
  }

  if (value === "yearly") {
    return "Yearly";
  }

  if (everyMonths) {
    return `Every ${everyMonths} month${everyMonths === 1 ? "" : "s"}`;
  }

  if (value === CUSTOM_PAYMENT_FREQUENCY.toLowerCase()) {
    return CUSTOM_PAYMENT_FREQUENCY;
  }

  return raw;
};

const getMonthlyRevenueValue = (amount, paymentFrequency) => {
  const divisor = getFrequencyMonths(paymentFrequency, { yearlyMonths: 12 });
  return (Number(amount) || 0) / divisor;
};

module.exports = {
  CUSTOM_PAYMENT_FREQUENCY,
  getFrequencyMonths,
  getMonthlyRevenueValue,
  normalizePaymentFrequency
};
