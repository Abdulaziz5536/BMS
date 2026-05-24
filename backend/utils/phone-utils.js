const ETHIOPIAN_PHONE_PREFIX = "+251";
const ETHIOPIAN_PHONE_ERROR = "Phone must be a valid Ethiopian mobile number like +2519XXXXXXXX or +2517XXXXXXXX";

const getDigits = (value) => String(value || "").replace(/\D/g, "");

const normalizeEthiopianPhone = (value, options = {}) => {
  const required = options.required !== false;
  const raw = String(value || "").trim();
  const digits = getDigits(raw);

  if (!digits || raw === ETHIOPIAN_PHONE_PREFIX) {
    if (required) {
      throw new Error(ETHIOPIAN_PHONE_ERROR);
    }

    return "";
  }

  let nationalNumber = digits;

  if (nationalNumber.startsWith("251")) {
    nationalNumber = nationalNumber.slice(3);
  } else if (nationalNumber.startsWith("0")) {
    nationalNumber = nationalNumber.slice(1);
  }

  if (!/^[79]\d{8}$/.test(nationalNumber)) {
    throw new Error(ETHIOPIAN_PHONE_ERROR);
  }

  return `${ETHIOPIAN_PHONE_PREFIX}${nationalNumber}`;
};

module.exports = {
  ETHIOPIAN_PHONE_ERROR,
  ETHIOPIAN_PHONE_PREFIX,
  normalizeEthiopianPhone
};
