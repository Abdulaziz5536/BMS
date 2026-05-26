export const VAT_RATE = 0.15;
export const VAT_RATE_LABEL = "15%";

const roundMoney = (amount) => Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;

// Receipts show VAT separately so a beginner can see the exact tax math in one place.
export const calculateVatBreakdown = (amount, rate = VAT_RATE) => {
  const subtotal = roundMoney(amount);
  const vat = roundMoney(subtotal * rate);

  return {
    subtotal,
    vat,
    totalWithVat: roundMoney(subtotal + vat)
  };
};
