const express = require('express');
const router = express.Router();
const User = require('../models/auth-model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  setAuthCookie,
  clearAuthCookie,
  getAuthTokenFromRequest
} = require("../utils/session-cookie-utils");
const {
  getSafeUser,
  normalizeRole
} = require("../middleware/auth-middleware");
const { withCaseInsensitiveCollation } = require("../utils/case-insensitive-utils");

// Authentication is intentionally small: users sign up, passwords are hashed,
// and login returns a JWT plus a browser cookie for protected pages.

const isSignupAllowed = () => {
  if (process.env.ALLOW_SIGNUP === "true") {
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.ALLOW_SIGNUP !== "false";
};

router.post('/signup', async (req,res) => {
  // Set ALLOW_SIGNUP=false after creating the owner/admin account on a public deployment.
  if (!isSignupAllowed()) {
    return res.status(403).json({ error: "Signup is disabled" });
  }

  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = normalizeRole(req.body.role);

  try{
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Please fill in all fields" });
    }

     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
         return res.status(400).json({ error: "Invalid email format" });
    }

     // Email is the login identifier, so it must be unique.
     const existingUser = await withCaseInsensitiveCollation(User.findOne({email}));
      if(existingUser){
        return res.status(400).json({error:"User already exists"});
  }

    if(!/^\d{6}$/.test(password)){
      return res.status(400).json({error:"Password should be 6 digits"});
  }

    // Store only the bcrypt hash, never the raw password.
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await User.create({name,email,password:hashedPassword,role});
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

    
  const user = await withCaseInsensitiveCollation(User.findOne({email}));

  if(!user){
    return res.status(400).json({error:"Invalid credentials"});
  }
  const storedPassword = String(user.password || "");
  const passwordIsHashed = /^\$2[aby]\$\d{2}\$/.test(storedPassword);
  const isMatch = passwordIsHashed
    ? await bcrypt.compare(password, storedPassword)
    : password === storedPassword;

  if(!isMatch){
    return res.status(400).json({error:"Invalid credentials"})
  }

  if (!passwordIsHashed) {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();
  }

  if (user.email !== email) {
    user.email = email;
    await user.save();
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Login is not configured" });
  }

  const safeUser = getSafeUser(user);

  // The token keeps enough user identity for the frontend, while /session still re-checks the database.
  const token = jwt.sign(
      safeUser,
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

  // The token is returned for API calls and also stored in an HttpOnly cookie for direct page visits.
  setAuthCookie(res, token, req);
  res.json({message:"Logged in successfully",token,user:safeUser});

  }
  catch(error){
    return res.status(500).json({error:"server error"});
  }

})

router.get('/session', async (req, res) => {
  const token = getAuthTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: "Login required" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Login is not configured" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = decoded.id ? await User.findById(decoded.id) : null;

    if (!user) {
      return res.status(401).json({ error: "Login expired" });
    }

    return res.json({ authenticated: true, user: getSafeUser(user) });
  } catch {
    return res.status(401).json({ error: "Login expired" });
  }
});

router.post('/logout', (req, res) => {
  // Clear both server-side browser access and the frontend localStorage token.
  clearAuthCookie(res, req);
  res.json({ message: "Logged out" });
});

module.exports = router;
module.exports.isSignupAllowed = isSignupAllowed;
