const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

// Main API entry point. This file wires middleware, all route groups, shared error handling,
// and the background reminder job after MongoDB connects.
const authRouter = require("./routes/auth-route");
const buildingRouter = require("./routes/building-route");
const floorRouter = require("./routes/floor-route");
const unitRouter = require("./routes/unit-route");
const tenantRouter = require("./routes/tenant-route");
const employeeRouter = require("./routes/employees-route");
const contractRouter = require("./routes/contract-route");
const dashboardRouter = require("./routes/dashboard-route");
const utilityRouter = require("./routes/utility-route");
const invoiceRouter = require("./routes/invoice-route");
const announcementRouter = require("./routes/announcement-route");
const systemRouter = require("./routes/system-route");
const { requireAuth } = require("./middleware/auth-middleware");
const { startDueDateReminderJob } = require("./services/due-reminder-service");
const { getSystemChecks } = require("./services/system-check-service");
const {
  getAllowedCorsOrigins,
  isOriginAllowed,
  shouldServeFrontendRoute
} = require("./utils/deployment-utils");
const {
  errorResponseMiddleware,
  getShortErrorMessage
} = require("./utils/error-response-utils");

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");
const shouldServeBundledFrontend =
  process.env.SERVE_FRONTEND !== "false" && fs.existsSync(frontendIndexPath);
const requiredProductionEnv = ["MONGO_URI", "JWT_SECRET"];
const missingProductionEnv = requiredProductionEnv.filter((name) => !process.env[name]);

if (process.env.NODE_ENV === "production" && missingProductionEnv.length > 0) {
  // Production should fail fast instead of running with broken login/database settings.
  console.error(`Missing required production env: ${missingProductionEnv.join(", ")}`);
  process.exit(1);
}

app.set("trust proxy", 1);
app.disable("x-powered-by");

// Small production-safe headers without adding another dependency.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

const allowedCorsOrigins = getAllowedCorsOrigins();

app.use(cors((req, callback) => {
  const origin = req.header("Origin");
  const requestOrigin = `${req.protocol}://${req.get("host")}`;
  const sameOrigin = origin === requestOrigin;

  // CORS is strict in production, but same-origin requests and local dev stay smooth.
  if (sameOrigin || isOriginAllowed(origin, allowedCorsOrigins)) {
    return callback(null, { origin: true });
  }

  return callback(new Error("CORS origin is not allowed"));
}));
app.use(express.json({ limit: "20mb" }));
app.use(errorResponseMiddleware);

if (shouldServeBundledFrontend) {
  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if (shouldServeFrontendRoute(req)) {
      return res.sendFile(frontendIndexPath);
    }

    return next();
  });
}

// Route order matters: each router owns a focused part of the BMS API.
app.use(authRouter);
app.use(requireAuth);
app.use(buildingRouter);
app.use(floorRouter);
app.use(unitRouter);
app.use(tenantRouter);
app.use(employeeRouter);
app.use(contractRouter);
app.use(dashboardRouter);
app.use(utilityRouter);
app.use(invoiceRouter);
app.use('/announcements', announcementRouter);
app.use(systemRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON request body" });
  }

  if (err?.message === "CORS origin is not allowed") {
    return res.status(403).json({ error: "CORS origin is not allowed" });
  }

  res.status(500).json({ error: getShortErrorMessage(err, "Server error") });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("mongoDB is connected");
    if (shouldServeBundledFrontend) {
      console.log("Frontend bundle is served from frontend/dist");
    }

    // System checks warn in the server log when a required deployment setting is missing.
    const systemChecks = getSystemChecks();
    systemChecks.checks
      .filter((check) => check.required && !check.ok)
      .forEach((check) => {
        console.warn(`System check warning: ${check.name} - ${check.message}`);
      });
    startDueDateReminderJob();
  })
  .catch((err) => console.log(err));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
