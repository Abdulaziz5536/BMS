export const VAT_RATE = 0.15;
export const VAT_RATE_LABEL = "15%";

const roundMoney = (amount) => Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;

// Payments are already VAT-inclusive, so receipts split the paid total into base amount and included VAT.
export const calculateVatBreakdown = (amount, rate = VAT_RATE) => {
  const totalWithVat = roundMoney(amount);
  const subtotal = roundMoney(totalWithVat / (1 + rate));
  const vat = roundMoney(totalWithVat - subtotal);

  return {
    subtotal,
    vat,
    totalWithVat
  };
};
