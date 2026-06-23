const mongoose = require("mongoose");

// Building is the top-level record. Most other collections are filtered by building.
const buildingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      trim: true,
      default: ""
    },
    managerName: {
      type: String,
      trim: true,
      default: ""
    },
    tinNumber: {
      type: String,
      trim: true,
      default: ""
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

buildingSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Building", buildingSchema);
