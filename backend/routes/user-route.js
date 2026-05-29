const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/auth-model");

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Manager account required" });
  }

  return next();
};

router.get("/users/viewers", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: "viewer" })
      .select("name email role createdAt updatedAt")
      .sort({ name: 1, email: 1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/users/viewers", requireAdmin, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Please fill in all fields" });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (!/^\d{6}$/.test(password)) {
      return res.status(400).json({ error: "Password should be 6 digits" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      existingUser.name = name;
      existingUser.password = hashedPassword;
      existingUser.role = "viewer";
      await existingUser.save();

      return res.json({
        message: "Read-only account updated",
        user: {
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role
        }
      });
    }

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "viewer"
    });

    res.status(201).json({
      message: "Read-only account created",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
