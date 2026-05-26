const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { isEmailConfigured, isSmsConfigured } = require("./messaging-service");
const { getAllowedCorsOrigins } = require("../utils/deployment-utils");

// System checks are lightweight operational diagnostics for the System page and health endpoint.
// They do not fix problems; they explain which required settings are missing.

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
  // Add new deployment checks here when a new external dependency is introduced.
  const serveFrontend = process.env.SERVE_FRONTEND !== "false";
  const frontendIndexPath = path.join(__dirname, "..", "..", "frontend", "dist", "index.html");
  const frontendBundleExists = fs.existsSync(frontendIndexPath);
  const corsOrigins = getAllowedCorsOrigins();
  const productionMode = process.env.NODE_ENV === "production";

  const checks = [
    {
      name: "MongoDB connection",
      ok: mongoose.connection.readyState === 1,
      required: true,
      message: mongoose.connection.readyState === 1 ? "Connected" : "Not connected"
    },
    envCheck("MONGO_URI"),
    envCheck("JWT_SECRET"),
    {
      name: "CORS origins",
      ok: !productionMode || serveFrontend || corsOrigins.length > 0,
      required: productionMode && !serveFrontend,
      message: corsOrigins.length > 0
        ? corsOrigins.join(", ")
        : serveFrontend
          ? "Same-origin frontend"
          : "Missing CORS_ORIGINS"
    },
    {
      name: "Frontend bundle",
      ok: !productionMode || !serveFrontend || frontendBundleExists,
      required: productionMode && serveFrontend,
      message: frontendBundleExists
        ? "frontend/dist found"
        : serveFrontend
          ? "Run npm run build before deployment"
          : "Served separately"
    },
    {
      name: "Public signup",
      ok: process.env.ALLOW_SIGNUP === "false",
      required: false,
      message: process.env.ALLOW_SIGNUP === "false"
        ? "Disabled"
        : "Enabled; disable after creating admin"
    },
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
  const requiredFailures = checks.filter((check) => check.required && !check.ok).length;
  const optionalWarnings = checks.filter((check) => !check.required && !check.ok).length;

  return {
    ok: requiredFailures === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      total: checks.length,
      required: checks.filter((check) => check.required).length,
      requiredFailures,
      optionalWarnings
    },
    checks
  };
};

module.exports = {
  getSystemChecks
};
