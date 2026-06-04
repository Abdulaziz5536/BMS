import { NavLink, useNavigate } from "react-router-dom";
import { useCallback, useContext, useEffect, useState } from "react";
import { SidebarSuppressContext } from "../components/sidebarContext";
import {
  clearAuthToken,
  clearCurrentUser,
  getCurrentUser,
  isReadOnlyUser
} from "../authSession";
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

// ============================================
// HEROICON IMPORTS (ADDED)
// ============================================
import { 
  HomeIcon,
  BuildingOfficeIcon,
  ViewColumnsIcon,
  Square3Stack3DIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  BoltIcon,
  UsersIcon,
  MegaphoneIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ReceiptPercentIcon
} from '@heroicons/react/24/outline';

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
    clearAuthToken();
    clearCurrentUser();
    navigate("/login", { replace: true });
  };

  return (
    <div className="sidebar">
      <h2>Building Management System</h2>

      {currentUser && (
        <div className="sidebar-user">
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
            <BuildingOfficeIcon className="sidebar-icon" />
            Buildings
          </NavLink>
        </li>

        <li>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
            <HomeIcon className="sidebar-icon" />
            Dashboard
          </NavLink>
        </li>

        <li>
          <NavLink to="/invoice" className={({ isActive }) => (isActive ? "active" : "")}>
            <ReceiptPercentIcon className="sidebar-icon" />
            Invoice
          </NavLink>
        </li>

        <li>
          <NavLink to="/utilities" className={({ isActive }) => (isActive ? "active" : "")}>
            <BoltIcon className="sidebar-icon" />
            Utilities
          </NavLink>
        </li>

        <li>
          <NavLink to="/floors" className={({ isActive }) => (isActive ? "active" : "")}>
            <ViewColumnsIcon className="sidebar-icon" />
            Floors
          </NavLink>
        </li>

        <li>
          <NavLink to="/units" className={({ isActive }) => (isActive ? "active" : "")}>
            <Square3Stack3DIcon className="sidebar-icon" />
            Units
          </NavLink>
        </li>

        <li>
          <NavLink to="/tenants" className={({ isActive }) => (isActive ? "active" : "")}>
            <UserGroupIcon className="sidebar-icon" />
            Tenants
          </NavLink>
        </li>

        <li>
          <NavLink to="/contracts" className={({ isActive }) => (isActive ? "active" : "")}>
            <DocumentTextIcon className="sidebar-icon" />
            Contracts
          </NavLink>
        </li>

        <li>
          <NavLink to="/employees" className={({ isActive }) => (isActive ? "active" : "")}>
            <UsersIcon className="sidebar-icon" />
            Employees
          </NavLink>
        </li>

        <li>
          <NavLink to="/announcements" className={({ isActive }) => (isActive ? "active" : "")}>
            <MegaphoneIcon className="sidebar-icon" />
            Announcements
          </NavLink>
        </li>

        <li>
          <NavLink to="/system" className={({ isActive }) => (isActive ? "active" : "")}>
            <Cog6ToothIcon className="sidebar-icon" />
            System
          </NavLink>
        </li>
      </ul>

      <button className="sidebar-logout-btn" onClick={logout}>
        <ArrowRightOnRectangleIcon className="sidebar-icon" />
        {portLabel("Logout", "ውጣ")}
      </button>
    </div>
  );
}