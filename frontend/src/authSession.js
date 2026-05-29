import { portLabel } from "./utils/portLabels";

const USER_STORAGE_KEY = "currentUser";

const normalizeRole = (role) => role === "viewer" ? "viewer" : "admin";

export const normalizeUser = (user = {}) => {
  if (!user || (!user.id && !user._id && !user.email)) {
    return null;
  }

  return {
    id: String(user.id || user._id || ""),
    name: user.name || "",
    email: user.email || "",
    role: normalizeRole(user.role)
  };
};

export const getCurrentUser = () => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const rawUser = localStorage.getItem(USER_STORAGE_KEY);
    return rawUser ? normalizeUser(JSON.parse(rawUser)) : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
};

export const setCurrentUser = (user) => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const normalizedUser = normalizeUser(user);
  if (!normalizedUser) {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }

  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
  return normalizedUser;
};

export const clearCurrentUser = () => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
};

export const isReadOnlyUser = (user = getCurrentUser()) => normalizeRole(user?.role) === "viewer";

export const getRoleLabel = (role) =>
  normalizeRole(role) === "viewer"
    ? portLabel("Read only", "ማየት ብቻ")
    : portLabel("Manager", "አስተዳዳሪ");
