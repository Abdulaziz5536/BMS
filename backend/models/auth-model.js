const mongoose = require('mongoose');

// User stores login accounts. Password values are bcrypt hashes, never raw passwords.
const userSchema = new mongoose.Schema({
    name:{
        type:String
    },
    email:{
        type:String,
        required:true,
        trim:true,
        lowercase:true
    },
    password:{
        type:String,
        required:true
    },
    role:{
        type:String,
        enum:["admin", "viewer"],
        default:"admin"
    },
})
userSchema.index(
    { email: 1 },
    { unique: true, collation: { locale: "en", strength: 2 } }
);
module.exports = mongoose.model('User',userSchema);
