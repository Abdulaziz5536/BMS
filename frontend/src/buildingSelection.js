const configuredApiBase = import.meta.env.VITE_API_BASE || "http://localhost:3000";
export const API_BASE = configuredApiBase.replace(/\/$/, "");

const BUILDING_STORAGE_KEY = "selectedBuildingId";
const BUILDING_CHANGED_EVENT = "buildingChanged";
const BUILDINGS_UPDATED_EVENT = "buildingsUpdated";
const responseCache = new Map();
const prefetchedBuildings = new Map();
const RESPONSE_CACHE_TTL = 45000;
const PREFETCH_TTL = 30000;

export const getSelectedBuildingId = () => localStorage.getItem(BUILDING_STORAGE_KEY) || "";

export const setSelectedBuildingId = (buildingId) => {
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
  const url = new URL(`${API_BASE}${path}`);

  if (buildingId) {
    url.searchParams.set("building", buildingId);
  }

  return url.toString();
};

export const readResponse = async (res) => {
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
  const res = await fetch(url);
  const data = await readResponse(res);

  if (!res.ok) {
    throw new Error(data.error || data.err || fallbackMessage);
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
      setError(error.message);
    }

    return cachedData;
  }
};

export const prefetchBuildingData = (buildingId = getSelectedBuildingId()) => {
  if (!buildingId) {
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
