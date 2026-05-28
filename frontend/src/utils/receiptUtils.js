const cleanReceiptPart = (value) => String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();

// FS numbers must be unique per receipt, so they are derived from the stored payment record id.
// Reprinting the same payment keeps the same FS number instead of inventing a new one.
export const formatFsNumber = (payment) => {
  const idPart = cleanReceiptPart(payment?._id).slice(-8);
  const datePart = cleanReceiptPart(payment?.paymentDate).slice(0, 8);

  if (idPart) {
    return `FS-${datePart || "PAY"}-${idPart}`;
  }

  return `FS-TEMP-${Date.now()}`;
};
