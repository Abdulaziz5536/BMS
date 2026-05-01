const mongoose = require('mongoose');


const employeesSchema = new mongoose.Schema({
     name:String,
     position:String,
     phoneNumber:String,

});

module.exports = mongoose.model("Employee",employeesSchema);
