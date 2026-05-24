const DAY_MS = 24 * 60 * 60 * 1000;

const isGregorianLeapYear = (year) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const isEthiopianLeapYear = (year) => year % 4 === 3;

const getEthiopianYearStart = (ethiopianYear) => {
  const gregorianYear = ethiopianYear + 7;
  const day = isGregorianLeapYear(ethiopianYear + 8) ? 12 : 11;
  return new Date(Date.UTC(gregorianYear, 8, day));
};

const pad = (value) => String(value).padStart(2, "0");

const toIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const normalizeUtcDate = (date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

const parseParts = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const isExplicitEthiopian = /\b(e\.?c\.?|ethiopian)\b/i.test(raw);
  const cleaned = raw
    .replace(/\b(e\.?c\.?|ethiopian)\b/gi, "")
    .trim();
  const match = cleaned.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);

  if (!match) return { raw, cleaned, isExplicitEthiopian };

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const isYearFirst = match[1].length === 4;

  return {
    raw,
    cleaned,
    isExplicitEthiopian,
    isYearFirst,
    year: isYearFirst ? first : third,
    month: second,
    day: isYearFirst ? third : first
  };
};

const shouldTreatAsEthiopian = (parts) => {
  if (!parts || !parts.year) return false;
  if (parts.isExplicitEthiopian || parts.month === 13) return true;
  if (parts.isYearFirst) return false;

  const currentGregorianYear = new Date().getUTCFullYear();
  return parts.year >= 1300 && parts.year <= currentGregorianYear - 4;
};

const ethiopianToGregorian = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 13) return null;
  const maxDay = month === 13 ? (isEthiopianLeapYear(year) ? 6 : 5) : 30;
  if (day < 1 || day > maxDay) return null;

  const start = getEthiopianYearStart(year);
  return new Date(start.getTime() + (((month - 1) * 30 + (day - 1)) * DAY_MS));
};

const parseGregorianParts = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

const parseFlexibleDateInput = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : normalizeUtcDate(value);
  }

  const dateTimeMatch = String(value).trim().match(/^(.+?)[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (dateTimeMatch) {
    const date = parseFlexibleDateInput(dateTimeMatch[1]);
    const hour = Number(dateTimeMatch[2]);
    const minute = Number(dateTimeMatch[3]);
    const second = Number(dateTimeMatch[4] || 0);

    if (!date || hour > 23 || minute > 59 || second > 59) return null;
    date.setUTCHours(hour, minute, second, 0);
    return date;
  }

  const parts = parseParts(value);
  if (parts?.year) {
    const date = shouldTreatAsEthiopian(parts)
      ? ethiopianToGregorian(parts.year, parts.month, parts.day)
      : parseGregorianParts(parts.year, parts.month, parts.day);
    return date ? normalizeUtcDate(date) : null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeUtcDate(parsed);
};

const normalizeDateOnlyString = (value) => {
  if (!value) return "";
  const date = parseFlexibleDateInput(value);
  return date ? toIsoDate(date) : "";
};

const gregorianToEthiopian = (value) => {
  const date = parseFlexibleDateInput(value);
  if (!date) return null;

  let year = date.getUTCFullYear() - 7;
  let start = getEthiopianYearStart(year);

  if (date < start) {
    year -= 1;
    start = getEthiopianYearStart(year);
  }

  const diff = Math.floor((date - start) / DAY_MS);
  return {
    year,
    month: Math.floor(diff / 30) + 1,
    day: (diff % 30) + 1
  };
};

const formatEthiopianDate = (value) => {
  const date = gregorianToEthiopian(value);
  if (!date) return "";
  return `${pad(date.day)}/${pad(date.month)}/${date.year} EC`;
};

module.exports = {
  ethiopianToGregorian,
  formatEthiopianDate,
  gregorianToEthiopian,
  isEthiopianLeapYear,
  normalizeDateOnlyString,
  parseFlexibleDateInput,
  toIsoDate
};
