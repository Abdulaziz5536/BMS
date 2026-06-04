const mongoose = require('mongoose');

// Employee stores staff information used by payroll reports and employee lists.
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
     // Basic monthly salary; payroll reports add allowances and calculate deductions from this.
     salary:{
          type:Number,
          default:0
     },
     transportAllowance:{
          type:Number,
          default:0
     },
     loan:{
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
