const { getEthiopianMonthRange } = require("./date-utils");
const { calculateLatePenalty } = require("./late-penalty-utils");

const buildOutstandingRentFilter = (buildingId) => {
  const filter = {
    outstandingBalance: { $gt: 0 },
    status: { $ne: "cancelled" }
  };

  if (buildingId) {
    filter.building = buildingId;
  }

  return filter;
};

const getCurrentOutstandingRentDueCutoff = (referenceDate = new Date()) =>
  getEthiopianMonthRange(referenceDate)?.end || null;

const buildCurrentOutstandingRentFilter = (buildingId, referenceDate = new Date()) => {
  const filter = buildOutstandingRentFilter(buildingId);
  const dueCutoff = getCurrentOutstandingRentDueCutoff(referenceDate);

  if (dueCutoff) {
    filter.dueDate = { $lt: dueCutoff };
  }

  return filter;
};

const getInvoiceOutstandingBalance = (invoice) =>
  Number(invoice?.outstandingBalance ?? Math.max(
    0,
    Number(invoice?.totalAmount || 0) - Number(invoice?.amountPaid || 0)
  ));

const getInvoiceOutstandingWithPenalty = (invoice, referenceDate = new Date()) => {
  const outstandingBalance = Math.max(0, getInvoiceOutstandingBalance(invoice));

  if (!invoice || outstandingBalance <= 0) {
    return {
      outstandingBalance,
      latePenalty: 0,
      additionalLatePenalty: 0,
      amountDue: outstandingBalance
    };
  }

  const rentAmount = Number(invoice.rentAmount || invoice.totalAmount || 0);
  const totalAmount = Number(invoice.totalAmount || 0);
  const storedLatePenalty = Math.max(0, Number(invoice.latePenalty || 0));
  const calculatedLatePenalty = calculateLatePenalty(invoice.dueDate, referenceDate, rentAmount);
  const impliedLatePenalty = Math.max(0, totalAmount - rentAmount);
  const latePenaltyAlreadyApplied = storedLatePenalty > 0 || impliedLatePenalty > 0;
  const latePenalty = Math.max(storedLatePenalty, impliedLatePenalty, calculatedLatePenalty);
  const additionalLatePenalty = latePenaltyAlreadyApplied ? 0 : calculatedLatePenalty;

  return {
    outstandingBalance,
    latePenalty,
    additionalLatePenalty,
    amountDue: outstandingBalance + additionalLatePenalty
  };
};

module.exports = {
  buildCurrentOutstandingRentFilter,
  buildOutstandingRentFilter,
  getCurrentOutstandingRentDueCutoff,
  getInvoiceOutstandingBalance,
  getInvoiceOutstandingWithPenalty
};
