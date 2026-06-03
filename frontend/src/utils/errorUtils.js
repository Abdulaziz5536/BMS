const MAX_VISIBLE_ERROR_LENGTH = 140;

// Frontend error helpers shorten backend/provider messages before showing them in the UI.

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const truncate = (message) => {
  if (message.length <= MAX_VISIBLE_ERROR_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_VISIBLE_ERROR_LENGTH - 3).trimEnd()}...`;
};

export const formatErrorMessage = (value, fallback = "") => {
  // Translate common technical failures into messages a manager can act on.
  if (value === "" || value === null) {
    return "";
  }

  const rawValue = value instanceof Error
    ? value.message
    : value?.message || value;
  const message = normalizeText(rawValue) || fallback;

  if (!message) {
    return "";
  }

  if (/E11000|duplicate key/i.test(message)) {
    return "This record already exists.";
  }

  if (/validation failed|ValidatorError/i.test(message)) {
    return "Please check the form and try again.";
  }

  if (/Cast to ObjectId failed|BSONError|ObjectId/i.test(message)) {
    return "Invalid record ID.";
  }

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "Cannot reach the server. Check the backend.";
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

export const getApiErrorMessage = (data, fallback = "Request failed") =>
  formatErrorMessage(data?.error || data?.err || data?.message || fallback, fallback);
