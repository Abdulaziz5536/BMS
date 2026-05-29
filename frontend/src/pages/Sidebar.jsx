import { NavLink, useNavigate } from "react-router-dom";
import { useCallback, useContext, useEffect, useState } from "react";
import { SidebarSuppressContext } from "../components/sidebarContext";
import { clearCurrentUser, getCurrentUser, getRoleLabel, isReadOnlyUser } from "../authSession";
import { portLabel } from "../utils/portLabels";
import {
  API_BASE,
  apiFetch,
  buildingsUpdatedEvent,
  getSelectedBuildingId,
  loadCachedJson,
  prefetchBuildingData,
  setSelectedBuildingId
} from "../buildingSelection";

// Sidebar owns navigation and the active-building selector used by every protected page.
export default function Sidebar({ persistent = false }) {
  const navigate = useNavigate();
  const suppressNestedSidebar = useContext(SidebarSuppressContext);
  const isSuppressed = suppressNestedSidebar && !persistent;
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(getSelectedBuildingId());
  const [currentUser] = useState(getCurrentUser());
  const readOnly = isReadOnlyUser(currentUser);

  const loadBuildings = useCallback(async () => {
    // Load buildings once, select a default if needed, then prefetch common building data.
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
          if (!readOnly) {
            prefetchBuildingData(data[0]._id);
          }
        } else {
          const activeBuildingId = getSelectedBuildingId();
          setSelectedBuilding(activeBuildingId);
          if (!readOnly) {
            prefetchBuildingData(activeBuildingId);
          }
        }
      },
      null,
      "Failed to load buildings"
    );
  }, [isSuppressed, readOnly]);

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
    // Changing buildings notifies all hooks/pages through buildingSelection events.
    setSelectedBuilding(buildingId);
    setSelectedBuildingId(buildingId);
    if (!readOnly) {
      prefetchBuildingData(buildingId);
    }
  };

  const logout = async () => {
    await apiFetch(`${API_BASE}/logout`, { method: "POST" }).catch(() => {});
    localStorage.removeItem("token");
    clearCurrentUser();
    navigate("/login", { replace: true });
  };

  return (
    <div className="sidebar">
      <h2>Building Management System</h2>

      {currentUser && (
        <div className="sidebar-user">
          <span>{portLabel("Signed in as", "የገባው")}</span>
          <strong>{currentUser.name || currentUser.email}</strong>
          <small>{getRoleLabel(currentUser.role)}</small>
        </div>
      )}

      <div className="building-switcher">
        <label>{portLabel("Active Building", "ህንፃ")}</label>
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
          <NavLink to="/utilities" className={({ isActive }) => (isActive ? "active" : "")}>
            Utilities
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
          <NavLink to="/accounts" className={({ isActive }) => (isActive ? "active" : "")}>
            Accounts
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

      <button className="sidebar-logout-btn" onClick={logout}>
        {portLabel("Logout", "ውጣ")}
      </button>
    </div>
  );
}
