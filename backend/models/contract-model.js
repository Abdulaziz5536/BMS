const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  tenant:{
    type:mongoose.Schema.Types.ObjectId, ref:"Tenant"
  },
  amount:String,
  date:String,
  contractLength:String,
  paymentFrequency:String
});

module.exports = mongoose.model("Contract",contractSchema);
