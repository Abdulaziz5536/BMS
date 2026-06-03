import { getApiErrorMessage, formatErrorMessage } from "./utils/errorUtils";
import { getAuthToken, isReadOnlyUser } from "./authSession";

const defaultApiBase = import.meta.env.PROD
  ? (typeof window === "undefined" ? "" : window.location.origin)
  : "http://localhost:3000";
const configuredApiBase = import.meta.env.VITE_API_BASE || defaultApiBase;
export const API_BASE = configuredApiBase.replace(/\/$/, "");

const BUILDING_STORAGE_KEY = "selectedBuildingId";
const BUILDING_CHANGED_EVENT = "buildingChanged";
const BUILDINGS_UPDATED_EVENT = "buildingsUpdated";
const responseCache = new Map();
const prefetchedBuildings = new Map();
const RESPONSE_CACHE_TTL = 45000;
const PREFETCH_TTL = 30000;

// Shared building-selection and API helpers.
// Pages use this file so selected-building filtering and response parsing work the same everywhere.

export const getSelectedBuildingId = () => localStorage.getItem(BUILDING_STORAGE_KEY) || "";

export const setSelectedBuildingId = (buildingId) => {
  // Store the active building and notify hooks/pages that depend on it.
  if (buildingId) {
    localStorage.setItem(BUILDING_STORAGE_KEY, buildingId);
  } else {
    localStorage.removeItem(BUILDING_STORAGE_KEY);
  }

  window.dispatchEvent(
    new CustomEvent(BUILDING_CHANGED_EVENT, { detail: buildingId || "" })
  );
};

export const notifyBuildingsUpdated = () => {
  window.dispatchEvent(new Event(BUILDINGS_UPDATED_EVENT));
};

export const buildingChangedEvent = BUILDING_CHANGED_EVENT;
export const buildingsUpdatedEvent = BUILDINGS_UPDATED_EVENT;

export const withBuilding = (path, buildingId = getSelectedBuildingId()) => {
  // Add ?building=<id> to API paths so backend queries stay scoped.
  const browserOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(`${API_BASE}${path}`, browserOrigin);

  if (buildingId) {
    url.searchParams.set("building", buildingId);
  }

  return url.toString();
};

export const apiFetch = (url, options = {}) => {
  // Add the login token to private API calls. Login/signup still work because no token is required there.
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers
  });
};

export const readResponse = async (res) => {
  // Backend should return JSON; this catches HTML error pages from crashed/dev servers.
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (!text) {
    return {};
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }

  throw new Error("Backend returned a non-JSON response. Restart the backend server and try again.");
};

export const getCachedData = (url) => responseCache.get(url)?.data;

export const setCachedData = (url, data) => {
  responseCache.set(url, {
    data,
    updatedAt: Date.now()
  });
};

export const invalidateCache = (match) => {
  // After create/update/delete, clear matching cached responses so pages reload fresh data.
  if (!match) {
    responseCache.clear();
    prefetchedBuildings.clear();
    return;
  }

  if (typeof match === "string") {
    prefetchedBuildings.delete(match);
  }

  for (const url of responseCache.keys()) {
    if (
      (typeof match === "string" && url.includes(match)) ||
      (typeof match === "function" && match(url))
    ) {
      responseCache.delete(url);
    }
  }
};

export const fetchJsonData = async (url, fallbackMessage = "Request failed") => {
  const res = await apiFetch(url);
  const data = await readResponse(res);

  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, fallbackMessage));
  }

  setCachedData(url, data);
  return data;
};

export const loadCachedJson = async (
  url,
  setData,
  setError,
  fallbackMessage = "Failed to load data",
  options = {}
) => {
  // Show cached data immediately, then refresh if it is stale or revalidation is requested.
  const cachedEntry = options.useCache === false ? undefined : responseCache.get(url);
  const cachedData = cachedEntry?.data;
  const cacheIsFresh =
    cachedEntry &&
    Date.now() - cachedEntry.updatedAt < (options.cacheTtl ?? RESPONSE_CACHE_TTL);

  if (cachedData !== undefined) {
    setData(cachedData);
  }

  if (cachedData !== undefined && cacheIsFresh && options.revalidate !== true) {
    if (setError) {
      setError("");
    }

    return cachedData;
  }

  try {
    const data = await fetchJsonData(url, fallbackMessage);
    setData(data);

    if (setError) {
      setError("");
    }

    return data;
  } catch (error) {
    if (setError && cachedData === undefined) {
      setError(formatErrorMessage(error, fallbackMessage));
    }

    return cachedData;
  }
};

export const prefetchBuildingData = (buildingId = getSelectedBuildingId()) => {
  // Warm common building-scoped pages after selection changes to make navigation feel faster.
  if (!buildingId || isReadOnlyUser()) {
    return;
  }

  const lastPrefetchedAt = prefetchedBuildings.get(buildingId) || 0;

  if (Date.now() - lastPrefetchedAt < PREFETCH_TTL) {
    return;
  }

  prefetchedBuildings.set(buildingId, Date.now());

  [
    withBuilding("/dashboard", buildingId),
    withBuilding("/floors", buildingId),
    withBuilding("/units", buildingId),
    withBuilding("/tenants", buildingId),
    withBuilding("/contract", buildingId),
    withBuilding("/employees", buildingId),
    withBuilding("/utilities", buildingId)
  ].forEach((url) => {
    fetchJsonData(url).catch(() => {});
  });
};
