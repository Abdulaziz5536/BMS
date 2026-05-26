const FRONTEND_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/dashboard",
  "/buildings",
  "/rent",
  "/floors",
  "/units",
  "/tenants",
  "/contracts",
  "/employees",
  "/utilities",
  "/invoice",
  "/announcements",
  "/activity",
  "/system"
]);

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
];

const splitCsvEnv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getAllowedCorsOrigins = () => {
  // Production hosts should set CORS_ORIGINS to the exact frontend URL(s).
  // In development, Vite's localhost origins are allowed automatically.
  const configuredOrigins = splitCsvEnv(process.env.CORS_ORIGINS || process.env.FRONTEND_URL);

  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return process.env.NODE_ENV === "production" ? [] : DEFAULT_DEV_ORIGINS;
};

const isOriginAllowed = (origin, allowedOrigins = getAllowedCorsOrigins()) => {
  // Same-origin requests have no Origin header, so they are always safe to allow.
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
};

const shouldServeFrontendRoute = (req) => {
  // Direct browser visits ask for HTML; API fetches usually ask for JSON or */*.
  // This keeps routes like /buildings usable both as a React page and as an API endpoint.
  const acceptHeader = String(req.headers.accept || "");

  return req.method === "GET" &&
    acceptHeader.includes("text/html") &&
    FRONTEND_ROUTES.has(req.path);
};

module.exports = {
  FRONTEND_ROUTES,
  DEFAULT_DEV_ORIGINS,
  splitCsvEnv,
  getAllowedCorsOrigins,
  isOriginAllowed,
  shouldServeFrontendRoute
};
