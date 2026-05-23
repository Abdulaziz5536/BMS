const mongoose = require("mongoose");
const { isEmailConfigured, isSmsConfigured } = require("./messaging-service");

const envCheck = (name, required = true) => ({
  name,
  ok: required ? Boolean(process.env[name]) : true,
  required,
  message: process.env[name]
    ? "Configured"
    : required
      ? "Missing"
      : "Optional"
});

const getSystemChecks = () => {
  const checks = [
    {
      name: "MongoDB connection",
      ok: mongoose.connection.readyState === 1,
      required: true,
      message: mongoose.connection.readyState === 1 ? "Connected" : "Not connected"
    },
    envCheck("MONGO_URI"),
    {
      name: "Reminder job",
      ok: process.env.DUE_REMINDER_ENABLED === "true",
      required: false,
      message: process.env.DUE_REMINDER_ENABLED === "true"
        ? "Enabled"
        : "Disabled"
    },
    {
      name: "Email reminders",
      ok: !process.env.DUE_REMINDER_SEND_EMAIL || process.env.DUE_REMINDER_SEND_EMAIL !== "true" || isEmailConfigured(),
      required: process.env.DUE_REMINDER_SEND_EMAIL === "true",
      message: isEmailConfigured() ? "SMTP configured" : "SMTP credentials missing"
    },
    {
      name: "SMS reminders",
      ok: !process.env.DUE_REMINDER_SEND_SMS || process.env.DUE_REMINDER_SEND_SMS !== "true" || isSmsConfigured(),
      required: process.env.DUE_REMINDER_SEND_SMS === "true",
      message: isSmsConfigured() ? "SMS configured" : "SMS credentials missing"
    }
  ];

  return {
    ok: checks.every((check) => check.ok || !check.required),
    checks
  };
};

module.exports = {
  getSystemChecks
};
