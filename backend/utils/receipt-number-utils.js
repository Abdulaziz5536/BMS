const cleanReceiptPart = (value) => String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();

const getReceiptDatePart = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return cleanReceiptPart(date.toISOString()).slice(0, 8);
  }

  return cleanReceiptPart(value).slice(0, 8);
};

const formatReceiptNumber = (payment) => {
  const idPart = cleanReceiptPart(payment?._id).slice(-8);
  return idPart ? `RCT-${idPart}` : "";
};

const formatFsNumber = (payment) => {
  const idPart = cleanReceiptPart(payment?._id).slice(-8);
  const datePart = getReceiptDatePart(payment?.paymentDate);

  return idPart ? `FS-${datePart || "PAY"}-${idPart}` : "";
};

module.exports = {
  formatFsNumber,
  formatReceiptNumber
};
