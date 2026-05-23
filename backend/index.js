const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

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
const { startDueDateReminderJob } = require("./services/due-reminder-service");
const { getSystemChecks } = require("./services/system-check-service");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(authRouter);
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
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON request body" });
  }

  res.status(500).json({ error: err.message || "Server error" });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("mongoDB is connected");
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
