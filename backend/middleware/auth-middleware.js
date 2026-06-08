const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/auth-model");
const { getAuthTokenFromRequest } = require("../utils/session-cookie-utils");

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/logout",
  "/system/health"
]);

const isPublicPath = (path) => PUBLIC_PATHS.has(path);
const READ_ONLY_ROLE = "viewer";
const READ_ONLY_ALLOWED_GET_PATHS = new Set([
  "/buildings",
  "/payment-status"
]);

const normalizeRole = (role) => role === READ_ONLY_ROLE ? READ_ONLY_ROLE : "admin";

const isReadOnlyRole = (role) => normalizeRole(role) === READ_ONLY_ROLE;

const getSafeUser = (user) => ({
  id: String(user._id || user.id || ""),
  name: user.name || "",
  email: user.email || "",
  role: normalizeRole(user.role)
});

const isReadOnlyAllowedPath = (method, path) => {
  if (method === "OPTIONS") {
    return true;
  }

  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  return READ_ONLY_ALLOWED_GET_PATHS.has(path);
};

const verifyRequestToken = (req) => {
  const token = getAuthTokenFromRequest(req);

  if (!token || !process.env.JWT_SECRET) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

const isRequestAuthenticated = (req) => Boolean(verifyRequestToken(req));

const isStoredPasswordMatch = async (storedPassword, password) => {
  const stored = String(storedPassword || "");
  const passwordIsHashed = /^\$2[aby]\$\d{2}\$/.test(stored);

  return passwordIsHashed
    ? bcrypt.compare(password, stored)
    : stored === password;
};

const requireAuth = async (req, res, next) => {
  // Every private API call must include the JWT created by /login.
  // This protects the backend even if someone bypasses the React screens.
  if (isPublicPath(req.path)) {
    return next();
  }

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

    req.user = getSafeUser(user);

    if (isReadOnlyRole(req.user.role) && !isReadOnlyAllowedPath(req.method, req.path)) {
      return res.status(403).json({ error: "This account is read-only" });
    }

    return next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Login expired" });
    }

    console.error("Auth check failed:", error.message);
    return res.status(401).json({ error: "Login expired" });
  }
};

const requireDeletePin = async (req, res, next) => {
  if (req.method !== "DELETE") {
    return next();
  }

  const deletePin = String(req.get("X-Delete-Pin") || req.body?.deletePin || "").trim();

  if (!deletePin) {
    return res.status(403).json({ error: "Enter your delete PIN to continue." });
  }

  try {
    const user = req.user?.id ? await User.findById(req.user.id) : null;

    if (!user) {
      return res.status(401).json({ error: "Login expired" });
    }

    const matches = await isStoredPasswordMatch(user.password, deletePin);

    if (!matches) {
      return res.status(403).json({ error: "Delete PIN is incorrect." });
    }

    return next();
  } catch (error) {
    console.error("Delete PIN check failed:", error.message);
    return res.status(500).json({ error: "Could not verify delete PIN." });
  }
};

module.exports = {
  PUBLIC_PATHS,
  READ_ONLY_ROLE,
  READ_ONLY_ALLOWED_GET_PATHS,
  getSafeUser,
  isPublicPath,
  isReadOnlyAllowedPath,
  isReadOnlyRole,
  normalizeRole,
  requireDeletePin,
  verifyRequestToken,
  isRequestAuthenticated,
  requireAuth
};
