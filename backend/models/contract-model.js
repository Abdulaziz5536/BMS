const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    index: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant"
  },

  amount:{
    type:Number,
    required:true

  },  

  date: {
    type: String
  },

  leaseStartDate: {
    type: String
  },

  leaseEndDate: {
    type: String
  },

  contractLength: String,
  paymentFrequency: String,

  status: {
    type: String,
    default: "pending"
  }

}, { timestamps: true });


module.exports = mongoose.model("Contract",contractSchema);
