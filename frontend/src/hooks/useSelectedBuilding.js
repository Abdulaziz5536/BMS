import { useEffect, useState } from "react";
import {
  buildingChangedEvent,
  getSelectedBuildingId
} from "../buildingSelection";

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
