const mongoose = require('mongoose');

const tenantFileSchema = new mongoose.Schema(
  {
    name: String,
    type: String,
    data: String
  },
  { _id: false }
);

const tenantSchema = new mongoose.Schema({
  building:{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    index: true
  },
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
  email:{
    type:String,
    trim:true,
    default:""
  },
  unit:{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Unit",
    required:true
  },
  idLicenseFile: tenantFileSchema,
  leaseAgreementFile: tenantFileSchema,
  emergencyContactName:{
    type:String,
    trim:true,
    default:""
  },
  emergencyContactPhone:{
    type:String,
    trim:true,
    default:""
  },
  emergencyContactRelation:{
    type:String,
    trim:true,
    default:""
  },
  moveInDate:{
    type:String,
    default:""
  },
  moveOutDate:{
    type:String,
    default:""
  }

})
module.exports = mongoose.model('Tenant', tenantSchema);
