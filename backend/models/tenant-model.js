const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  tenantId:{
    type:Number,
    required:true
  },
  tenantName:{
    type:String,
    required:true
  },
  phone:{
    type:Number,
    required:true
  },
  unit:{
    type:String,
    required:true
  }

})
module.exports = mongoose.model('Tenat', tenantSchema);
