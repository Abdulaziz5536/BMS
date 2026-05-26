const express = require('express');
const router = express.Router();
const User = require('../models/auth-model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Authentication is intentionally small: users sign up, passwords are hashed,
// and login returns a JWT that the frontend stores for protected pages.

router.post('/signup', async (req,res) => {
  // Set ALLOW_SIGNUP=false after creating the owner/admin account on a public deployment.
  if (process.env.ALLOW_SIGNUP === "false") {
    return res.status(403).json({ error: "Signup is disabled" });
  }

  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try{
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Please fill in all fields" });
    }

     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
         return res.status(400).json({ error: "Invalid email format" });
    }

     // Email is the login identifier, so it must be unique.
     const existingUser = await User.findOne({email});
      if(existingUser){
        return res.status(400).json({error:"User already exists"});
  }

    if(!/^\d{6}$/.test(password)){
      return res.status(400).json({error:"Password should be 6 digits"});
  }

    // Store only the bcrypt hash, never the raw password.
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
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  
  try{
  if (!email || !password) {
    return res.status(400).json({ error: "Please fill in all fields" });
  }

    
  const user = await User.findOne({email});

  if(!user){
    return res.status(400).json({error:"User does not exist"});
  }
  const isMatch = await bcrypt.compare(password, user.password);

  if(!isMatch){
    return res.status(400).json({error:"Invalid credentials"})
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Login is not configured" });
  }

  // The token contains only the user id and expires after one week.
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
