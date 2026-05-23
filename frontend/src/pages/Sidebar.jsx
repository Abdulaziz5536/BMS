import { NavLink } from "react-router-dom";
import { useCallback, useContext, useEffect, useState } from "react";
import { SidebarSuppressContext } from "../components/sidebarContext";
import {
  API_BASE,
  buildingsUpdatedEvent,
  getSelectedBuildingId,
  loadCachedJson,
  prefetchBuildingData,
  setSelectedBuildingId
} from "../buildingSelection";

export default function Sidebar({ persistent = false }) {
  const suppressNestedSidebar = useContext(SidebarSuppressContext);
  const isSuppressed = suppressNestedSidebar && !persistent;
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(getSelectedBuildingId());

  const loadBuildings = useCallback(async () => {
    if (isSuppressed) {
      return;
    }

    await loadCachedJson(
      `${API_BASE}/buildings`,
      (data) => {
        setBuildings(data);

        if (!getSelectedBuildingId() && data.length > 0) {
          setSelectedBuildingId(data[0]._id);
          setSelectedBuilding(data[0]._id);
          prefetchBuildingData(data[0]._id);
        } else {
          const activeBuildingId = getSelectedBuildingId();
          setSelectedBuilding(activeBuildingId);
          prefetchBuildingData(activeBuildingId);
        }
      },
      null,
      "Failed to load buildings"
    );
  }, [isSuppressed]);

  useEffect(() => {
    if (isSuppressed) {
      return undefined;
    }

    loadBuildings();

    const syncSelectedBuilding = (event) => {
      setSelectedBuilding(event.detail || getSelectedBuildingId());
    };

    window.addEventListener("buildingChanged", syncSelectedBuilding);
    window.addEventListener(buildingsUpdatedEvent, loadBuildings);

    return () => {
      window.removeEventListener("buildingChanged", syncSelectedBuilding);
      window.removeEventListener(buildingsUpdatedEvent, loadBuildings);
    };
  }, [isSuppressed, loadBuildings]);

  if (isSuppressed) {
    return null;
  }

  const changeBuilding = (buildingId) => {
    setSelectedBuilding(buildingId);
    setSelectedBuildingId(buildingId);
    prefetchBuildingData(buildingId);
  };

  return (
    <div className="sidebar">
      <h2>Building Management System</h2>

      <div className="building-switcher">
        <label>Active Building</label>
        <select value={selectedBuilding} onChange={(e) => changeBuilding(e.target.value)}>
          <option value="">Select Building</option>
          {buildings.map((building) => (
            <option key={building._id} value={building._id}>
              {building.name}
            </option>
          ))}
        </select>
      </div>

      <ul>
        <li>
          <NavLink to="/buildings" className={({ isActive }) => (isActive ? "active" : "")}>
            Buildings
          </NavLink>
        </li>

        <li>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
        </li>

        <li>
          <NavLink to="/invoice" className={({ isActive }) => (isActive ? "active" : "")}> 
          Invoice
          </NavLink>
        </li>

        <li>
          <NavLink to="/floors" className={({ isActive }) => (isActive ? "active" : "")}>
            Floors
          </NavLink>
        </li>

        <li>
          <NavLink to="/units" className={({ isActive }) => (isActive ? "active" : "")}>
            Units
          </NavLink>
        </li>

        <li>
          <NavLink to="/tenants" className={({ isActive }) => (isActive ? "active" : "")}>
            Tenants
          </NavLink>
        </li>

        <li>
          <NavLink to="/contracts" className={({ isActive }) => (isActive ? "active" : "")}>
            Contracts
          </NavLink>
        </li>

        <li>
          <NavLink to="/employees" className={({ isActive }) => (isActive ? "active" : "")}>
            Employees
          </NavLink>
        </li>

        <li>
          <NavLink to="/utilities" className={({ isActive }) => (isActive ? "active" : "")}>
            Utilities
          </NavLink>
        </li>

        <li>
          <NavLink to="/announcements" className={({ isActive }) => (isActive ? "active" : "")}>
            Announcements
          </NavLink>
        </li>

        <li>
          <NavLink to="/system" className={({ isActive }) => (isActive ? "active" : "")}>
            System
          </NavLink>
        </li>
      </ul>
    </div>
  );
}
