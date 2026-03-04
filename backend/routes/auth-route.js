const express = require('express');
const router = express.Router();
const User = require('../models/auth-model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

router.post('/signup', async (req,res) => {
  const {name,email,password} = req.body;

  try{

     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
         return res.status(400).json({ error: "Invalid email format" });
    }

     const existingUser = await User.findOne({email});
      if(existingUser){
        return res.status(400).json({error:"User already exists"});
  }

    if(password.length !== 6){
      return res.status(400).json({error:"Password should be 6 digits"});
  }

    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(password, salt);

     const user = await User.create({name,email,password:hashedPassword});
       res.json({message:"Account created successfully"});


  }
  catch(error){
    res.status(500).json({error:error.message});
  }
 

})
router.post('/login', async (req,res) => {
  const {email,password} = req.body;
  
  try{

    
  const user = await User.findOne({email});

  if(!user){
    return res.status(400).json({error:"User does not exist"});
  }
  const isMatch = bcrypt.compare(password, user.password);

  if(!isMatch){
    return res.status(400).json({error:"Invalid credentials"})
  }

  const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

  res.json({message:"Logged in successfully",token});

  }
  catch(error){
    return res.status(500).json({error:"server error"});
  }

})

module.exports = router;