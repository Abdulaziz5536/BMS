const mongoose = require("mongoose");

// Unit is a rentable space inside one floor/building. Occupancy is derived from tenants.
const unitSchema = new mongoose.Schema({

  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    index: true
  },
  unitId:String,
  floor: { type: mongoose.Schema.Types.ObjectId, ref: "Floor" },
  area:String,
  type:String
});

module.exports = mongoose.model("Unit",unitSchema);
