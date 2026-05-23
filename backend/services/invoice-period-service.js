const {
  ethiopianToGregorian,
  gregorianToEthiopian,
  isEthiopianLeapYear,
  parseFlexibleDateInput
} = require("../utils/date-utils");

const DAY_MS = 24 * 60 * 60 * 1000;

const getFrequencyMonths = (paymentFrequency) => {
  switch (String(paymentFrequency || "").toLowerCase()) {
    case "quarterly":
      return 3;
    case "every 6 months":
      return 6;
    case "yearly":
      return 13;
    case "monthly":
    default:
      return 1;
  }
};

const getMaxEthiopianDay = (year, month) => {
  if (month === 13) {
    return isEthiopianLeapYear(year) ? 6 : 5;
  }

  return 30;
};

const addDays = (date, days) =>
  new Date(date.getTime() + days * DAY_MS);

const addEthiopianMonths = (date, monthsToAdd) => {
  const ethiopianDate = gregorianToEthiopian(date);

  if (!ethiopianDate) {
    return null;
  }

  const totalMonths = ethiopianDate.year * 13 + (ethiopianDate.month - 1) + monthsToAdd;
  const year = Math.floor(totalMonths / 13);
  const month = (totalMonths % 13) + 1;
  const day = Math.min(ethiopianDate.day, getMaxEthiopianDay(year, month));

  return ethiopianToGregorian(year, month, day);
};

const getLeaseStartDate = (contract, fallbackDate) =>
  parseFlexibleDateInput(contract.leaseStartDate || contract.date) ||
  parseFlexibleDateInput(fallbackDate) ||
  new Date();

const getLeaseEndDate = (contract) =>
  parseFlexibleDateInput(contract.leaseEndDate);

const getPeriodEnd = (periodStart, contract, leaseEnd) => {
  const nextPeriodStart = addEthiopianMonths(
    periodStart,
    getFrequencyMonths(contract.paymentFrequency)
  );

  if (!nextPeriodStart) {
    return null;
  }

  const periodEnd = addDays(nextPeriodStart, -1);

  if (leaseEnd && periodEnd > leaseEnd) {
    return leaseEnd;
  }

  return periodEnd;
};

const getPeriodContainingDate = (contract, targetDate, leaseStart, leaseEnd) => {
  let periodStart = leaseStart;
  let periodEnd = getPeriodEnd(periodStart, contract, leaseEnd);
  let guard = 0;

  while (periodEnd && targetDate > periodEnd && guard < 500) {
    periodStart = addDays(periodEnd, 1);
    periodEnd = getPeriodEnd(periodStart, contract, leaseEnd);
    guard += 1;
  }

  return { periodStart, periodEnd };
};

const getNextInvoicePeriod = async (Model, contract, targetDate = null) => {
  const parsedTargetDate = parseFlexibleDateInput(targetDate);
  const leaseStart = getLeaseStartDate(contract, parsedTargetDate);
  const leaseEnd = getLeaseEndDate(contract);

  if (parsedTargetDate) {
    const period = getPeriodContainingDate(contract, parsedTargetDate, leaseStart, leaseEnd);

    if (leaseEnd && period.periodStart > leaseEnd) {
      return null;
    }

    return period;
  }

  const latestInvoice = await Model.findOne({ contract: contract._id })
    .sort({ periodEnd: -1 });

  const latestPeriodEnd = parseFlexibleDateInput(latestInvoice?.periodEnd);
  const shouldContinueFromLatest = latestPeriodEnd && latestPeriodEnd >= leaseStart;

  const periodStart = shouldContinueFromLatest
    ? addDays(latestInvoice.periodEnd, 1)
    : leaseStart;

  if (leaseEnd && periodStart > leaseEnd) {
    return null;
  }

  return {
    periodStart,
    periodEnd: getPeriodEnd(periodStart, contract, leaseEnd)
  };
};

const getDateTime = (value) => {
  const date = parseFlexibleDateInput(value);
  return date ? date.getTime() : null;
};

const recalculateInvoicePeriodsForContract = async (Model, contract) => {
  const leaseStart = getLeaseStartDate(contract);
  const leaseEnd = getLeaseEndDate(contract);

  if (!leaseStart) {
    return { updated: 0, skipped: 0 };
  }

  const invoices = await Model.find({
    contract: contract._id,
    status: { $ne: "cancelled" }
  }).sort({ periodStart: 1, createdAt: 1, _id: 1 });

  let periodStart = leaseStart;
  let updated = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    if (leaseEnd && periodStart > leaseEnd) {
      skipped += 1;
      continue;
    }

    const periodEnd = getPeriodEnd(periodStart, contract, leaseEnd);

    if (!periodEnd || periodEnd < periodStart) {
      skipped += 1;
      continue;
    }

    const changed =
      getDateTime(invoice.periodStart) !== getDateTime(periodStart) ||
      getDateTime(invoice.periodEnd) !== getDateTime(periodEnd) ||
      getDateTime(invoice.dueDate) !== getDateTime(periodEnd);

    if (changed) {
      invoice.periodStart = periodStart;
      invoice.periodEnd = periodEnd;
      invoice.dueDate = periodEnd;
      invoice.remindersSent = [];
      await invoice.save();
      updated += 1;
    }

    periodStart = addDays(periodEnd, 1);
  }

  return { updated, skipped };
};

module.exports = {
  getNextInvoicePeriod,
  recalculateInvoicePeriodsForContract
};
