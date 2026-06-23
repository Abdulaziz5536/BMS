const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/auth-model");
const { recordAuditLog } = require("../services/audit-log-service");
const { withCaseInsensitiveCollation } = require("../utils/case-insensitive-utils");

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

    const existingUser = await withCaseInsensitiveCollation(User.findOne({ email }));

    if (existingUser) {
      if (existingUser.role !== "viewer") {
        return res.status(409).json({ error: "That email already belongs to a manager account" });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
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

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
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

router.patch("/users/me/password", requireAdmin, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new PIN are required" });
    }

    if (!/^\d{6}$/.test(newPassword)) {
      return res.status(400).json({ error: "New PIN should be 6 digits" });
    }

    const user = req.user?.id ? await User.findById(req.user.id) : null;
    if (!user) {
      return res.status(401).json({ error: "Login expired" });
    }

    const storedPassword = String(user.password || "");
    const passwordIsHashed = /^\$2[aby]\$\d{2}\$/.test(storedPassword);
    const isMatch = passwordIsHashed
      ? await bcrypt.compare(currentPassword, storedPassword)
      : currentPassword === storedPassword;

    if (!isMatch) {
      return res.status(400).json({ error: "Current PIN is incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    await recordAuditLog({
      action: "updated",
      entityType: "user",
      entityId: user._id,
      entityLabel: user.email,
      message: "Manager PIN changed"
    });

    res.json({ message: "PIN changed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to change PIN" });
  }
});

module.exports = router;
