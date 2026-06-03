const AUTH_COOKIE_NAME = "bms_session";
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const parseCookies = (cookieHeader = "") =>
  String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[name] = value;
      return cookies;
    }, {});

const getAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.SESSION_COOKIE_SECURE === "true",
  path: "/",
  maxAge: AUTH_COOKIE_MAX_AGE_MS
});

const getRequestPort = (req = {}) => {
  const host = String(req.headers?.host || "");
  const portMatch = host.match(/:(\d+)$/);

  return portMatch?.[1] || String(process.env.PORT || "");
};

const getAuthCookieName = (req) => {
  const port = getRequestPort(req);
  return port ? `${AUTH_COOKIE_NAME}_${port}` : AUTH_COOKIE_NAME;
};

const setAuthCookie = (res, token, req) => {
  // The cookie lets the backend protect direct browser visits like /dashboard.
  const { maxAge, ...clearOptions } = getAuthCookieOptions();

  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
  res.cookie(getAuthCookieName(req), token, getAuthCookieOptions());
};

const clearAuthCookie = (res, req) => {
  const { maxAge, ...clearOptions } = getAuthCookieOptions();

  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
  res.clearCookie(getAuthCookieName(req), clearOptions);
};

const getAuthTokenFromRequest = (req) => {
  // API calls send Authorization; direct page refreshes can only send the HttpOnly cookie.
  const authHeader = String(req.headers.authorization || "");

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[getAuthCookieName(req)] || "";
};

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  parseCookies,
  getAuthCookieName,
  getAuthCookieOptions,
  setAuthCookie,
  clearAuthCookie,
  getAuthTokenFromRequest
};
