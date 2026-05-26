const mongoose = require('mongoose');

// User stores login accounts. Password values are bcrypt hashes, never raw passwords.
const userSchema = new mongoose.Schema({
    name:{
        type:String
    },
    email:{
        type:String,
        required:true
    },
    password:{
        type:String,
        required:true
    },
})
module.exports = mongoose.model('User',userSchema);

