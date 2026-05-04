import Sidebar from "./Sidebar";
import "../style.css";
import { useState } from "react";
import { useEffect } from "react";
import { BuildingOfficeIcon, UserGroupIcon, KeyIcon } from "@heroicons/react/24/outline";

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
        

      <div className="dashboard-container">

        <div className="card">
          <BuildingOfficeIcon className="card-icon"/>
          Total Units <br /> {dashboard?.totalUnits}</div>
        <div className="card">
          <KeyIcon className="card-icon"/>
          
          Total Tenants  <br/> {dashboard?.totalTenants}</div>
          <div className="card">
            <UserGroupIcon className="card-icon"/>
            Total Employees <br/> {dashboard?.totalEmployees}</div>

      </div>
        


        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}