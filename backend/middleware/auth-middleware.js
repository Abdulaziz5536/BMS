const jwt = require("jsonwebtoken");
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

module.exports = {
  PUBLIC_PATHS,
  READ_ONLY_ROLE,
  READ_ONLY_ALLOWED_GET_PATHS,
  getSafeUser,
  isPublicPath,
  isReadOnlyAllowedPath,
  isReadOnlyRole,
  normalizeRole,
  verifyRequestToken,
  isRequestAuthenticated,
  requireAuth
};
