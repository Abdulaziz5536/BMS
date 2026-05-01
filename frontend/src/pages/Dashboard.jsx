import Sidebar from "./Sidebar";
import "../style.css";
import { useState } from "react";
import { useEffect } from "react";

export default function Dashboard() {

  const [dashboard, setDashboard] = useState({});


  const fetchDashboard = async () => {
    const res = await fetch("http://localhost:3000/dashboard");
    const data = await res.json();
    setDashboard(data);
  };

  useEffect(() => {
    fetchDashboard();
  },[])


  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Dashboard</h1>
        <p>Welcome to the Building Management System.</p>

        <div>Floors | {dashboard?.totalFloors}</div>
        <div>Units | {dashboard?.totalUnits}</div>
        <div>Tenants | {dashboard?.totalTenants}</div>


        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}