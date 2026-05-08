const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const authRouter = require("./routes/auth-route");
const buildingRouter = require("./routes/building-route");
const floorRouter = require("./routes/floor-route");
const unitRouter = require("./routes/unit-route");
const tenantRouter = require("./routes/tenant-route");
const employeeRouter = require("./routes/employees-route");
const contractRouter = require("./routes/contract-route");
const dashboardRouter = require("./routes/dashboard-route");
const utilityRouter = require("./routes/utility-route");
const rentRouter = require("./routes/rent-route");

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
app.use(rentRouter);

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
  .then(() => console.log("mongoDB is connected"))
  .catch((err) => console.log(err));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
