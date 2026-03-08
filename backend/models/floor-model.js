const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({

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