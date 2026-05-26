import { useEffect, useState } from "react";
import {
  buildingChangedEvent,
  getSelectedBuildingId
} from "../buildingSelection";

// Hook that keeps React state synced with the building id stored in localStorage.
export default function useSelectedBuilding() {
  const [selectedBuildingId, setSelectedBuildingIdState] = useState(getSelectedBuildingId());

  useEffect(() => {
    const handleBuildingChange = (event) => {
      setSelectedBuildingIdState(event.detail || getSelectedBuildingId());
    };

    const handleStorageChange = (event) => {
      if (event.key === "selectedBuildingId") {
        setSelectedBuildingIdState(event.newValue || "");
      }
    };

    window.addEventListener(buildingChangedEvent, handleBuildingChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(buildingChangedEvent, handleBuildingChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return selectedBuildingId;
}
