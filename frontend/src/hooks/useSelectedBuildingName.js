import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  buildingChangedEvent,
  buildingsUpdatedEvent,
  getSelectedBuildingId,
  loadCachedJson
} from "../buildingSelection";
import { DEFAULT_BRAND_NAME, getBuildingBrandName } from "../utils/brandingUtils";

// Hook for display/print/email labels that should follow the selected building name.
export default function useSelectedBuildingName(fallback = DEFAULT_BRAND_NAME) {
  const [buildingName, setBuildingName] = useState(fallback);

  const loadBuildingName = useCallback(async () => {
    // Load all buildings once, then find the active one locally.
    const selectedBuildingId = getSelectedBuildingId();

    if (!selectedBuildingId) {
      setBuildingName(fallback);
      return;
    }

    await loadCachedJson(
      `${API_BASE}/buildings`,
      (buildings) => {
        const selectedBuilding = Array.isArray(buildings)
          ? buildings.find((building) => String(building._id) === String(selectedBuildingId))
          : null;

        setBuildingName(getBuildingBrandName(selectedBuilding, fallback));
      },
      null,
      "Failed to load buildings"
    );
  }, [fallback]);

  useEffect(() => {
    loadBuildingName();

    window.addEventListener(buildingChangedEvent, loadBuildingName);
    window.addEventListener(buildingsUpdatedEvent, loadBuildingName);

    return () => {
      window.removeEventListener(buildingChangedEvent, loadBuildingName);
      window.removeEventListener(buildingsUpdatedEvent, loadBuildingName);
    };
  }, [loadBuildingName]);

  return buildingName;
}
