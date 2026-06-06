export const CUSTOM_PAYMENT_FREQUENCY = "Custom";

export const PAYMENT_FREQUENCY_OPTIONS = [
  { value: "Monthly", label: "Monthly" },
  { value: "Every 3 months", label: "Every 3 months" },
  { value: "Every 6 months", label: "Every 6 months" },
  { value: "Yearly", label: "Yearly" },
  { value: CUSTOM_PAYMENT_FREQUENCY, label: "Custom" }
];

const getEveryMonths = (paymentFrequency) => {
  const match = String(paymentFrequency || "").trim().toLowerCase().match(/^every\s+(\d+)\s+months?$/);
  if (!match) return null;

  const months = Number(match[1]);
  return Number.isInteger(months) && months > 0 ? months : null;
};

export const formatPaymentFrequency = (paymentFrequency) => {
  const raw = String(paymentFrequency || "").trim();
  const value = raw.toLowerCase();
  const everyMonths = getEveryMonths(raw);

  if (!raw) return "";
  if (value === "monthly" || everyMonths === 1) return "Monthly";
  if (value === "quarterly" || value === "quartely" || everyMonths === 3) return "Every 3 months";
  if (everyMonths === 6) return "Every 6 months";
  if (value === "yearly") return "Yearly";
  if (everyMonths) return `Every ${everyMonths} months`;
  if (value === CUSTOM_PAYMENT_FREQUENCY.toLowerCase()) return CUSTOM_PAYMENT_FREQUENCY;
  return raw;
};

export const getPaymentFrequencyFormState = (paymentFrequency) => {
  const formatted = formatPaymentFrequency(paymentFrequency);
  const knownOption = PAYMENT_FREQUENCY_OPTIONS.some((option) => option.value === formatted);

  if (knownOption && formatted !== CUSTOM_PAYMENT_FREQUENCY) {
    return { paymentFrequency: formatted, customMonths: "" };
  }

  const everyMonths = getEveryMonths(paymentFrequency);
  return {
    paymentFrequency: formatted ? CUSTOM_PAYMENT_FREQUENCY : "",
    customMonths: everyMonths ? String(everyMonths) : ""
  };
};

export const buildCustomPaymentFrequency = (months) => {
  const value = Number(months);
  if (!Number.isInteger(value) || value < 2) return "";
  return `Every ${value} months`;
};
