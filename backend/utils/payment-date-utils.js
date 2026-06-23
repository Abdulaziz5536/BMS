const DEFAULT_MAX_FUTURE_PAYMENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseMaxFuturePaymentDays = (value = process.env.MAX_FUTURE_PAYMENT_DAYS) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_MAX_FUTURE_PAYMENT_DAYS;
};

const isPaymentDateTooFarInFuture = (
  paymentDate,
  {
    referenceDate = new Date(),
    maxFutureDays = parseMaxFuturePaymentDays()
  } = {}
) => {
  const date = new Date(paymentDate);
  const reference = new Date(referenceDate);

  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) {
    return false;
  }

  return date.getTime() > reference.getTime() + maxFutureDays * DAY_MS;
};

module.exports = {
  DEFAULT_MAX_FUTURE_PAYMENT_DAYS,
  isPaymentDateTooFarInFuture,
  parseMaxFuturePaymentDays
};
