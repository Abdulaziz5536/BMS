const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const authRouter = require("./routes/auth-route");
const floorRouter = require("./routes/floor-route");
const unitRouter = require("./routes/unit-route");
const tenantRouter = require("./routes/tenant-route");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(authRouter);
app.use(floorRouter);
app.use(unitRouter);
app.use(tenantRouter);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("mongoDB is connected"))
  .catch((err) => console.log(err));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
