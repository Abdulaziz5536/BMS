import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  buildingChangedEvent,
  buildingsUpdatedEvent,
  getSelectedBuildingId,
  loadCachedJson
} from "../buildingSelection";

// Receipt and branding screens use this hook when they need more than the building name,
// such as the owner TIN stored on the selected building.
export default function useSelectedBuildingDetails() {
  const [building, setBuilding] = useState(null);

  const loadBuildingDetails = useCallback(async () => {
    const selectedBuildingId = getSelectedBuildingId();

    if (!selectedBuildingId) {
      setBuilding(null);
      return;
    }

    await loadCachedJson(
      `${API_BASE}/buildings`,
      (buildings) => {
        const selectedBuilding = Array.isArray(buildings)
          ? buildings.find((item) => String(item._id) === String(selectedBuildingId))
          : null;

        setBuilding(selectedBuilding || null);
      },
      null,
      "Failed to load buildings"
    );
  }, []);

  useEffect(() => {
    loadBuildingDetails();

    window.addEventListener(buildingChangedEvent, loadBuildingDetails);
    window.addEventListener(buildingsUpdatedEvent, loadBuildingDetails);

    return () => {
      window.removeEventListener(buildingChangedEvent, loadBuildingDetails);
      window.removeEventListener(buildingsUpdatedEvent, loadBuildingDetails);
    };
  }, [loadBuildingDetails]);

  return building;
}
