const MAX_CLIENT_ERROR_LENGTH = 140;
const MAX_ERROR_ITEMS = 3;

// Error utilities keep API/frontend errors short enough for users to understand.
// They also hide long provider/database messages that are only useful to developers.

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const truncate = (message) => {
  if (message.length <= MAX_CLIENT_ERROR_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_CLIENT_ERROR_LENGTH - 3).trimEnd()}...`;
};

const getShortErrorMessage = (value, fallback = "Request failed") => {
  // Known technical errors are translated into safe, readable messages.
  const rawValue = value instanceof Error
    ? value.message
    : value?.message || value;
  const message = normalizeText(rawValue) || fallback;

  if (/E11000|duplicate key/i.test(message)) {
    return "This record already exists.";
  }

  if (/validation failed|ValidatorError/i.test(message)) {
    return "Please check the form and try again.";
  }

  if (/Cast to ObjectId failed|BSONError|ObjectId/i.test(message)) {
    return "Invalid record ID.";
  }

  if (/Unexpected token|<!doctype|<html|non-JSON/i.test(message)) {
    return "Server returned an invalid response.";
  }

  if (/SMS provider returned/i.test(message)) {
    return "SMS failed. Check provider settings.";
  }

  if (/EAUTH|Invalid login|SMTP/i.test(message) && !/not configured/i.test(message)) {
    return "Email failed. Check SMTP settings.";
  }

  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(message)) {
    return "Connection failed. Check service settings.";
  }

  return truncate(message);
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sanitizeErrorCollection = (value) => {
  if (Array.isArray(value)) {
    const visibleItems = value.slice(0, MAX_ERROR_ITEMS).map((item) =>
      isPlainObject(item) || Array.isArray(item)
        ? sanitizeErrorPayload(item)
        : getShortErrorMessage(item)
    );
    const hiddenCount = value.length - visibleItems.length;

    if (hiddenCount > 0) {
      visibleItems.push({ error: `${hiddenCount} more errors hidden.` });
    }

    return visibleItems;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeErrorCollection(nestedValue)
      ])
    );
  }

  return getShortErrorMessage(value);
};

const sanitizeErrorPayload = (payload) => {
  // Walk API response objects and shorten nested error lists before they reach the browser.
  if (Array.isArray(payload)) {
    return payload.map(sanitizeErrorPayload);
  }

  if (!isPlainObject(payload)) {
    return payload;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (key === "error" || key === "err") {
        return [key, getShortErrorMessage(value)];
      }

      if (key === "errors") {
        return [key, sanitizeErrorCollection(value)];
      }

      return [key, value];
    })
  );
};

const hasErrorShape = (body) =>
  isPlainObject(body) && ("error" in body || "err" in body || "errors" in body);

const errorResponseMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 400 || hasErrorShape(body)) {
      return originalJson(sanitizeErrorPayload(body));
    }

    return originalJson(body);
  };

  next();
};

module.exports = {
  errorResponseMiddleware,
  getShortErrorMessage,
  sanitizeErrorPayload
};
