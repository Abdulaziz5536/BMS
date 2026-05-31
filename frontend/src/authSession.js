import { portLabel } from "./utils/portLabels";

const USER_STORAGE_KEY = "currentUser";
const LEGACY_TOKEN_STORAGE_KEY = "token";

const getAuthStorageScope = () => {
  if (typeof window === "undefined") {
    return "default";
  }

  return window.location.port || window.location.host || "default";
};

const getTokenStorageKey = () => `token:${getAuthStorageScope()}`;
const getUserStorageKey = () => `${USER_STORAGE_KEY}:${getAuthStorageScope()}`;

const getSessionStore = () => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

const getLocalStore = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const clearSharedAuthStorage = () => {
  const store = getLocalStore();

  if (!store) {
    return;
  }

  store.removeItem(getTokenStorageKey());
  store.removeItem(getUserStorageKey());
  store.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  store.removeItem(USER_STORAGE_KEY);
};

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
  const store = getSessionStore();

  if (!store) {
    return null;
  }

  try {
    const rawUser = store.getItem(getUserStorageKey());
    return rawUser ? normalizeUser(JSON.parse(rawUser)) : null;
  } catch {
    store.removeItem(getUserStorageKey());
    store.removeItem(USER_STORAGE_KEY);
    return null;
  }
};

export const setCurrentUser = (user) => {
  const store = getSessionStore();

  if (!store) {
    return null;
  }

  const normalizedUser = normalizeUser(user);
  if (!normalizedUser) {
    store.removeItem(getUserStorageKey());
    store.removeItem(USER_STORAGE_KEY);
    clearSharedAuthStorage();
    return null;
  }

  store.removeItem(USER_STORAGE_KEY);
  store.setItem(getUserStorageKey(), JSON.stringify(normalizedUser));
  clearSharedAuthStorage();
  return normalizedUser;
};

export const clearCurrentUser = () => {
  const store = getSessionStore();

  if (store) {
    store.removeItem(getUserStorageKey());
    store.removeItem(USER_STORAGE_KEY);
  }

  clearSharedAuthStorage();
};

export const getAuthToken = () => {
  const store = getSessionStore();

  if (!store) {
    return "";
  }

  return store.getItem(getTokenStorageKey()) || "";
};

export const setAuthToken = (token) => {
  const store = getSessionStore();

  if (!store) {
    return;
  }

  if (token) {
    store.setItem(getTokenStorageKey(), token);
  } else {
    store.removeItem(getTokenStorageKey());
  }

  clearSharedAuthStorage();
};

export const clearAuthToken = () => {
  const store = getSessionStore();

  if (store) {
    store.removeItem(getTokenStorageKey());
    store.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  }

  clearSharedAuthStorage();
};

export const isReadOnlyUser = (user = getCurrentUser()) => normalizeRole(user?.role) === "viewer";

export const getRoleLabel = (role) =>
  normalizeRole(role) === "viewer"
    ? portLabel("Read only", "ማየት ብቻ")
    : portLabel("Manager", "አስተዳዳሪ");
