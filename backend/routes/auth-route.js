const express = require('express');
const router = express.Router();
const User = require('../models/auth-model');

router.post('/register', async (req,res) => {
  const {name,email,password} = req.body;

  const existingUser = await User.findOne({email});
  if(existingUser){
    return res.status.json({error:"user already exists"});
  }
  if(!email.includes("@")){
    return res.status.json({error:"email is invalid"});
  }
  if(password.length !== 6){
    return res.status.json({error:"password should be 4 digits"});
  }

  const user = await User.create({name,email,password});
  res.json({message:"account created successfully"});


})
router.post('/login',async (req,res) => {
  const {email,password} = req.body;

  const existingUser = await User.findOne({email,password});

  if(!existingUser){
    return res.json({error:"user does not exist"});
  }
  if(existingUser.password !== password){
    return res.json({error:"password is not correct"});
  }

  res.json({message:"logged in successfully"});

})

module.exports = router;