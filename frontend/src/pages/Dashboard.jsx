import Sidebar from "./Sidebar";
import "../style.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  KeyIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  ScaleIcon
} from "@heroicons/react/24/outline";
import {
  loadCachedJson,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";

export default function Dashboard() {
  const navigate = useNavigate();
  const selectedBuildingId = useSelectedBuilding();
  const [dashboard, setDashboard] = useState({});
  const [error, setError] = useState("");

  const fetchDashboard = async () => {
    if (!selectedBuildingId) {
      setDashboard({});
      return;
    }

    await loadCachedJson(
      withBuilding("/dashboard", selectedBuildingId),
      setDashboard,
      setError,
      "Failed to load dashboard"
    );
  };

  useEffect(() => {
    fetchDashboard();
  }, [selectedBuildingId]);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Dashboard</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building to see dashboard data.</p>
        )}
        {error && <p className="error">{error}</p>}

        <div className="dashboard-container">
          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <BuildingOfficeIcon className="card-icon" />
            Total Units <br /> {dashboard?.totalUnits || 0}
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <KeyIcon className="card-icon" />
            Occupied Units <br /> {dashboard?.totalUnitsOccupied || 0}
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <BuildingOfficeIcon className="card-icon" />
            Available Units <br /> {dashboard?.totalUnitsAvailable || 0}
          </div>

          <div className="card" onClick={() => navigate("/tenants")} style={{ cursor: "pointer" }}>
            <KeyIcon className="card-icon" />
            Total Tenants <br /> {dashboard?.totalTenants || 0}
          </div>

          <div className="card" onClick={() => navigate("/employees")} style={{ cursor: "pointer" }}>
            <UserGroupIcon className="card-icon" />
            Total Employees <br /> {dashboard?.totalEmployees || 0}
          </div>
        </div>

        <h1 style={{ marginTop: 100 }}>Financial Summary</h1>

        <div className="revenue-container">
          <div className="card">
            <CurrencyDollarIcon className="card-icon" />
            Monthly Rent Revenue: Br {dashboard?.totalRevenue || 0}
          </div>

          <div className="card">
            <CurrencyDollarIcon className="card-icon" />
            Utility Revenue: Br {dashboard?.utilityRevenue || 0}
          </div>

          <div className="card">
            <ArrowPathIcon className="card-icon" />
            Rent Due: {dashboard?.pendingPayments || 0}
          </div>

          <div className="card" onClick={() => navigate("/utilities")} style={{ cursor: "pointer" }}>
            <ArrowPathIcon className="card-icon" />
            Utilities Due: {dashboard?.pendingUtilityPayments || 0}
          </div>

          <div className="card">
            <ScaleIcon className="card-icon" />
            Occupancy: {dashboard?.occupancyRate || 0}%
          </div>
        </div>

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
