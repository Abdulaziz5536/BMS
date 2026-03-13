const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({

  unitId:String,
  floor: { type: mongoose.Schema.Types.ObjectId, ref: "Floor" },
  area:String,
  type:String
});

module.exports = mongoose.model("Unit",unitSchema);