const nodemailer = require("nodemailer");
const { normalizeEthiopianPhone } = require("../utils/phone-utils");
const { getShortErrorMessage } = require("../utils/error-response-utils");

// Messaging service owns all outbound email/SMS behavior.
// Building-specific env variables let different buildings use different SMTP accounts or SMS sender IDs.

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

const textToHtml = (value) => escapeHtml(value).replace(/\n/g, "<br>");

const normalizeEnvKey = (value = "") =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getBuildingEnvPrefixes = (namespace, building) => {
  // For "Aymen Commercial Center", try both SMS_AYMEN_COMMERCIAL_CENTER_* and SMS_AYMEN_*.
  const buildingName = typeof building === "string" ? building : building?.name;
  const normalizedName = normalizeEnvKey(buildingName);
  const firstWord = normalizeEnvKey(String(buildingName || "").split(/\s+/)[0] || "");

  return [...new Set([normalizedName, firstWord].filter(Boolean).map((key) => `${namespace}_${key}`))];
};

const getEnvValue = (prefix, name, fallback) =>
  process.env[`${prefix}_${name}`] || fallback;

const getSmtpConfig = (building) => {
  // Prefer building-specific SMTP credentials; fall back to global SMTP_* settings.
  const buildingPrefix = getBuildingEnvPrefixes("SMTP", building).find((prefix) =>
    process.env[`${prefix}_USER`] && process.env[`${prefix}_PASS`]
  );
  const prefix = buildingPrefix || "SMTP";

  return {
    key: prefix,
    host: getEnvValue(prefix, "HOST", process.env.SMTP_HOST || "smtp.gmail.com"),
    port: Number(getEnvValue(prefix, "PORT", process.env.SMTP_PORT || 587)),
    secure: getEnvValue(prefix, "SECURE", process.env.SMTP_SECURE),
    service: getEnvValue(prefix, "SERVICE", process.env.SMTP_SERVICE),
    rejectUnauthorized: getEnvValue(
      prefix,
      "REJECT_UNAUTHORIZED",
      process.env.SMTP_REJECT_UNAUTHORIZED
    ),
    user: getEnvValue(prefix, "USER", process.env.SMTP_USER),
    pass: getEnvValue(prefix, "PASS", process.env.SMTP_PASS),
    from: getEnvValue(prefix, "FROM", process.env.SMTP_FROM)
  };
};

const isEmailConfigured = (building) => {
  const config = getSmtpConfig(building);

  return Boolean(config.user && config.pass);
};

const getSmsConfig = (building) => {
  // One SMS API can be shared while sender IDs vary per building.
  const buildingPrefix = getBuildingEnvPrefixes("SMS", building).find((prefix) =>
    process.env[`${prefix}_SENDER_ID`] ||
      process.env[`${prefix}_API_KEY`] ||
      process.env[`${prefix}_API_URL`]
  );
  const prefix = buildingPrefix || "SMS";

  return {
    key: prefix,
    apiUrl: getEnvValue(prefix, "API_URL", process.env.SMS_API_URL),
    apiKey: getEnvValue(prefix, "API_KEY", process.env.SMS_API_KEY),
    apiKeyHeader: getEnvValue(prefix, "API_KEY_HEADER", process.env.SMS_API_KEY_HEADER),
    apiKeyPrefix: getEnvValue(prefix, "API_KEY_PREFIX", process.env.SMS_API_KEY_PREFIX),
    apiKeyField: getEnvValue(prefix, "API_KEY_FIELD", process.env.SMS_API_KEY_FIELD),
    method: getEnvValue(prefix, "API_METHOD", process.env.SMS_API_METHOD || "POST"),
    toField: getEnvValue(prefix, "TO_FIELD", process.env.SMS_TO_FIELD || "to"),
    messageField: getEnvValue(prefix, "MESSAGE_FIELD", process.env.SMS_MESSAGE_FIELD || "message"),
    senderIdField: getEnvValue(prefix, "SENDER_ID_FIELD", process.env.SMS_SENDER_ID_FIELD || "senderId"),
    senderId: getEnvValue(prefix, "SENDER_ID", process.env.SMS_SENDER_ID)
  };
};

const hasAnySmsSenderId = () =>
  Object.keys(process.env).some((key) =>
    key !== "SMS_SENDER_ID" && /^SMS_[A-Z0-9_]+_SENDER_ID$/.test(key) && process.env[key]
  );

const isSmsConfigured = (building) => {
  const config = getSmsConfig(building);
  const hasSender = building ? Boolean(config.senderId) : Boolean(config.senderId || hasAnySmsSenderId());

  return Boolean(config.apiUrl && config.apiKey && hasSender);
};

const describeSendError = (error) => {
  const details = [
    error?.message,
    error?.cause?.code,
    error?.cause?.hostname ? `host ${error.cause.hostname}` : "",
    error?.response
  ].filter(Boolean);

  return getShortErrorMessage(details.join(" - "), "Messaging failed");
};

const emailTransporters = new Map();

const getEmailTransporter = (building) => {
  const config = getSmtpConfig(building);

  if (!config.user || !config.pass) {
    throw createHttpError(
      400,
      "Email is not configured. Set SMTP_USER and SMTP_PASS in backend/.env."
    );
  }

  // Cache transporters per env prefix so repeated sends do not recreate SMTP clients.
  if (!emailTransporters.has(config.key)) {
    const secure = config.secure === undefined || config.secure === ""
      ? config.port === 465
      : config.secure === "true";
    const options = {
      host: config.host,
      port: config.port,
      secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    };

    if (config.service && !config.host) {
      options.service = config.service;
    }

    if (config.rejectUnauthorized === "false") {
      options.tls = { rejectUnauthorized: false };
    }

    emailTransporters.set(config.key, {
      from: config.from || config.user,
      transporter: nodemailer.createTransport(options)
    });
  }

  return emailTransporters.get(config.key);
};

const formatSmsNumber = (phoneNumber) => {
  try {
    return normalizeEthiopianPhone(phoneNumber);
  } catch {
    return "";
  }
};

const getSmsApiKeyHeaderValue = (config) => {
  // Providers differ: some expect "Authorization: Bearer key", others use a custom header.
  const headerName = config.apiKeyHeader || "Authorization";
  const configuredPrefix = config.apiKeyPrefix;
  const defaultPrefix = headerName.toLowerCase() === "authorization" ? "Bearer " : "";
  const prefix = configuredPrefix === undefined ? defaultPrefix : configuredPrefix;

  return {
    headerName,
    value: `${prefix}${config.apiKey}`
  };
};

const parseProviderResponse = (text) => {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const providerResponseFailed = (responseBody) => {
  // Some SMS providers return HTTP 200 with an error status inside the JSON body.
  if (!responseBody || typeof responseBody !== "object") {
    return false;
  }

  if (responseBody.success === false || responseBody.ok === false) {
    return true;
  }

  const status = String(responseBody.status || responseBody.state || "").toLowerCase();
  return ["error", "failed", "failure", "rejected"].includes(status);
};

const sendSMS = async (phoneNumber, message, options = {}) => {
  try {
    const config = getSmsConfig(options.building);

    if (!isSmsConfigured(options.building)) {
      throw new Error(
        "SMS is not configured for this building. Set SMS_API_URL, SMS_API_KEY, and SMS_SENDER_ID or SMS_<BUILDING>_SENDER_ID in backend/.env."
      );
    }

    const to = formatSmsNumber(phoneNumber);

    if (!to) {
      throw new Error("No phone number available");
    }

    const { headerName, value } = getSmsApiKeyHeaderValue(config);
    const toField = config.toField;
    const messageField = config.messageField;
    const senderField = config.senderIdField;
    const apiKeyBodyField = config.apiKeyField || "";
    // Field names are configurable because SMS providers use different JSON shapes.
    const body = {
      [toField]: to,
      [messageField]: message,
      [senderField]: config.senderId
    };

    if (apiKeyBodyField) {
      body[apiKeyBodyField] = config.apiKey;
    }

    const response = await fetch(config.apiUrl, {
      method: config.method,
      headers: {
        "Content-Type": "application/json",
        [headerName]: value
      },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    const responseBody = parseProviderResponse(responseText);

    if (!response.ok || providerResponseFailed(responseBody)) {
      const detail = typeof responseBody === "string"
        ? responseBody
        : JSON.stringify(responseBody);
      throw new Error(`SMS provider returned ${response.status}: ${detail || "request failed"}`);
    }

    return { success: true, to, providerResponse: responseBody };
  } catch (error) {
    const message = describeSendError(error);
    console.error("SMS sending error:", message);
    return { success: false, error: message };
  }
};

const sendEmail = async (email, subject, message, html, options = {}) => {
  try {
    const { transporter, from } = getEmailTransporter(options.building);
    const info = await transporter.sendMail({
      from: options.from || from,
      to: email,
      subject,
      text: message,
      html: html || textToHtml(message)
    });

    if (!info?.messageId) {
      throw new Error("No message ID returned from SMTP server");
    }

    return { success: true };
  } catch (error) {
    const message = describeSendError(error);
    console.error("Email sending error:", message);
    return { success: false, error: message };
  }
};

module.exports = {
  createHttpError,
  formatSmsNumber,
  isEmailConfigured,
  isSmsConfigured,
  sendEmail,
  sendSMS
};
