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

});

module.exports = mongoose.model("Employee",employeesSchema);
