const jwt = require("jsonwebtoken");

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/system/health"
]);

const isPublicPath = (path) => PUBLIC_PATHS.has(path);

const requireAuth = (req, res, next) => {
  // Every private API call must include the JWT created by /login.
  // This protects the backend even if someone bypasses the React screens.
  if (isPublicPath(req.path)) {
    return next();
  }

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Login required" });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Login is not configured" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Login expired" });
  }
};

module.exports = {
  PUBLIC_PATHS,
  isPublicPath,
  requireAuth
};
