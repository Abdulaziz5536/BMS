const nodemailer = require("nodemailer");

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getEnvBoolean = (name, defaultValue = false) => {
  if (process.env[name] === undefined) {
    return defaultValue;
  }

  return process.env[name] === "true";
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

const isEmailConfigured = () =>
  Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const describeSendError = (error) => {
  const details = [
    error?.message,
    error?.cause?.code,
    error?.cause?.hostname ? `host ${error.cause.hostname}` : "",
    error?.response
  ].filter(Boolean);

  return details.join(" - ") || "Unknown messaging error";
};

let emailTransporter;

const getEmailTransporter = () => {
  if (!isEmailConfigured()) {
    throw createHttpError(
      400,
      "Email is not configured. Set SMTP_USER and SMTP_PASS in backend/.env."
    );
  }

  if (!emailTransporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = getEnvBoolean("SMTP_SECURE", port === 465);
    const options = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (process.env.SMTP_SERVICE && !process.env.SMTP_HOST) {
      options.service = process.env.SMTP_SERVICE;
    }

    if (process.env.SMTP_REJECT_UNAUTHORIZED === "false") {
      options.tls = { rejectUnauthorized: false };
    }

    emailTransporter = nodemailer.createTransport(options);
  }

  return emailTransporter;
};

const isSmsConfigured = () =>
  Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);

const formatSmsNumber = (phoneNumber) => {
  let number = String(phoneNumber || "").replace(/[^\d+]/g, "");
  const countryCode = process.env.SMS_DEFAULT_COUNTRY_CODE || "251";

  if (!number) {
    return "";
  }

  if (number.startsWith("+")) {
    return number;
  }

  if (number.startsWith(countryCode)) {
    return `+${number}`;
  }

  if (number.startsWith("0")) {
    return `+${countryCode}${number.slice(1)}`;
  }

  return `+${countryCode}${number}`;
};

const getSmsApiKeyHeaderValue = () => {
  const headerName = process.env.SMS_API_KEY_HEADER || "Authorization";
  const configuredPrefix = process.env.SMS_API_KEY_PREFIX;
  const defaultPrefix = headerName.toLowerCase() === "authorization" ? "Bearer " : "";
  const prefix = configuredPrefix === undefined ? defaultPrefix : configuredPrefix;

  return {
    headerName,
    value: `${prefix}${process.env.SMS_API_KEY}`
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
  if (!responseBody || typeof responseBody !== "object") {
    return false;
  }

  if (responseBody.success === false || responseBody.ok === false) {
    return true;
  }

  const status = String(responseBody.status || responseBody.state || "").toLowerCase();
  return ["error", "failed", "failure", "rejected"].includes(status);
};

const sendSMS = async (phoneNumber, message) => {
  try {
    if (!isSmsConfigured()) {
      throw new Error(
        "SMS is not configured. Set SMS_API_URL, SMS_API_KEY, and SMS_SENDER_ID in backend/.env."
      );
    }

    const to = formatSmsNumber(phoneNumber);

    if (!to) {
      throw new Error("No phone number available");
    }

    const { headerName, value } = getSmsApiKeyHeaderValue();
    const toField = process.env.SMS_TO_FIELD || "to";
    const messageField = process.env.SMS_MESSAGE_FIELD || "message";
    const senderField = process.env.SMS_SENDER_ID_FIELD || "senderId";
    const apiKeyBodyField = process.env.SMS_API_KEY_FIELD || "";
    const body = {
      [toField]: to,
      [messageField]: message,
      [senderField]: process.env.SMS_SENDER_ID
    };

    if (apiKeyBodyField) {
      body[apiKeyBodyField] = process.env.SMS_API_KEY;
    }

    const response = await fetch(process.env.SMS_API_URL, {
      method: process.env.SMS_API_METHOD || "POST",
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

const sendEmail = async (email, subject, message, html) => {
  try {
    const transporter = getEmailTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const info = await transporter.sendMail({
      from,
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
