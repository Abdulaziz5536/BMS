const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
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

  contractLength: String,
  paymentFrequency: String,

  status: {
    type: String,
    default: "pending"
  }

}, { timestamps: true });


module.exports = mongoose.model("Contract",contractSchema);
