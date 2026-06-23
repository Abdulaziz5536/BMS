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

unitSchema.index(
  { building: 1, unitId: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
unitSchema.index({ floor: 1 });
unitSchema.index({ building: 1, floor: 1 });

module.exports = mongoose.model("Unit",unitSchema);
