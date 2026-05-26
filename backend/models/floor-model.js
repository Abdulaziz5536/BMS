const mongoose = require('mongoose');

// Floor belongs to one building and stores capacity/area metadata for unit planning.
const floorSchema = new mongoose.Schema({
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    index: true
  },

  floor: {
    type: Number,
    required: true
  },

  units: {
    type: Number,
    required: true
  },

  totalSqm: {
    type: Number,
    required: true
  }

});

module.exports = mongoose.model('Floor', floorSchema);
