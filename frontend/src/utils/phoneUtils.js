export const ETHIOPIAN_PHONE_PREFIX = "+251";
export const ETHIOPIAN_PHONE_ERROR = "Phone must be a valid Ethiopian mobile number like +2519XXXXXXXX or +2517XXXXXXXX";

// Phone helpers keep Ethiopian mobile numbers consistent in forms and API payloads.

const getDigits = (value) => String(value || "").replace(/\D/g, "");

export const formatEthiopianPhoneInput = (value) => {
  const raw = String(value || "").trim();
  const digits = getDigits(value);

  if (!raw) {
    return "";
  }

  if (raw.startsWith("+")) {
    return `+${digits.slice(0, 12)}`;
  }

  return digits.slice(0, 12);
};

export const normalizeEthiopianPhone = (value, options = {}) => {
  const required = options.required !== false;
  const raw = String(value || "").trim();
  const digits = getDigits(raw);

  if (!digits || raw === ETHIOPIAN_PHONE_PREFIX) {
    return required ? "" : "";
  }

  let nationalNumber = digits;

  if (nationalNumber.startsWith("251")) {
    nationalNumber = nationalNumber.slice(3);
  } else if (nationalNumber.startsWith("0")) {
    nationalNumber = nationalNumber.slice(1);
  }

  return /^[79]\d{8}$/.test(nationalNumber) ? `${ETHIOPIAN_PHONE_PREFIX}${nationalNumber}` : "";
};

export const isValidEthiopianPhone = (value, options = {}) => {
  const required = options.required !== false;
  const raw = String(value || "").trim();

  if (!raw || raw === ETHIOPIAN_PHONE_PREFIX) {
    return !required;
  }

  return Boolean(normalizeEthiopianPhone(raw, { required }));
};

export const formatEthiopianPhoneDisplay = (value) =>
  normalizeEthiopianPhone(value, { required: false }) || String(value || "");

export const phoneInputProps = {
  type: "tel",
  inputMode: "tel",
  maxLength: 13,
  placeholder: "+2519XXXXXXXX",
  pattern: "\\+251[79][0-9]{8}"
};
