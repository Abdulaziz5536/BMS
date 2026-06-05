import { NavLink, useNavigate } from "react-router-dom";
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
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

let sidebarNavScrollTop = 0;

// Sidebar owns navigation and the active-building selector used by every protected page.
export default function Sidebar({ persistent = false }) {
  const navigate = useNavigate();
  const suppressNestedSidebar = useContext(SidebarSuppressContext);
  const isSuppressed = suppressNestedSidebar && !persistent;
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(getSelectedBuildingId());
  const [currentUser] = useState(getCurrentUser());
  const navListRef = useRef(null);
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

  useLayoutEffect(() => {
    if (isSuppressed) {
      return undefined;
    }

    const navList = navListRef.current;

    if (!navList) {
      return undefined;
    }

    navList.scrollTop = sidebarNavScrollTop;

    return () => {
      sidebarNavScrollTop = navList.scrollTop;
    };
  }, [isSuppressed]);

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

  const keepSidebarScrollStable = (event) => {
    if (event.button === 0) {
      event.preventDefault();
    }
  };

  const rememberSidebarScroll = (event) => {
    sidebarNavScrollTop = event.currentTarget.scrollTop;
  };

  const navItems = [
    { to: "/buildings", label: "Buildings" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/invoice", label: "Invoice" },
    { to: "/utilities", label: "Utilities" },
    { to: "/floors", label: "Floors" },
    { to: "/units", label: "Units" },
    { to: "/tenants", label: "Tenants" },
    { to: "/contracts", label: "Contracts" },
    { to: "/employees", label: "Employees" },
    { to: "/announcements", label: "Announcements" },
    { to: "/maintenance", label: "Maintenance" },
    { to: "/system", label: "System" }
  ];

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

      <ul ref={navListRef} onScroll={rememberSidebarScroll}>
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => (isActive ? "active" : "")}
              onMouseDown={keepSidebarScrollStable}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <button className="sidebar-logout-btn" onClick={logout}>
        {portLabel("Logout", "ውጣ")}
      </button>
    </div>
  );
}
