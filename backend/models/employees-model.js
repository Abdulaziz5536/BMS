const mongoose = require('mongoose');


const employeesSchema = new mongoose.Schema({
     building:{
          type: mongoose.Schema.Types.ObjectId,
          ref: "Building",
          index: true
     },
     name:String,
     position:String,
     phoneNumber:String,
     email:{
          type:String,
          trim:true,
          default:""
     },
     salary:{
          type:Number,
          default:0
     },
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

});

module.exports = mongoose.model("Employee",employeesSchema);
