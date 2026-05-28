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

const setAuthCookie = (res, token) => {
  // The cookie lets the backend protect direct browser visits like /dashboard.
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
};

const clearAuthCookie = (res) => {
  const { maxAge, ...clearOptions } = getAuthCookieOptions();

  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
};

const getAuthTokenFromRequest = (req) => {
  // API calls send Authorization; direct page refreshes can only send the HttpOnly cookie.
  const authHeader = String(req.headers.authorization || "");

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || "";
};

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  parseCookies,
  getAuthCookieOptions,
  setAuthCookie,
  clearAuthCookie,
  getAuthTokenFromRequest
};
