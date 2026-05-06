import Sidebar from "./Sidebar";
import "../style.css";
import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BuildingOfficeIcon, UserGroupIcon, KeyIcon,CurrencyDollarIcon, ArrowPathIcon, ScaleIcon } from "@heroicons/react/24/outline";

export default function Dashboard() {

  const navigate = useNavigate();

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
  console.log("Dashboard",dashboard);
  

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Dashboard</h1>
        

      <div className="dashboard-container">

        <div className="card" onClick={() => navigate("/units")} style={{cursor:"pointer"}}>
          <BuildingOfficeIcon className="card-icon"/>
          Total Units Occupied <br /> {dashboard?.totalUnitsOccupied}</div>
        <div className="card" onClick={() => navigate("/tenants")} style={{cursor:"pointer"}}>
          <KeyIcon className="card-icon"/>
          
          Total Tenants  <br/> {dashboard?.totalTenants}</div>
          <div className="card" onClick={() => navigate("/employees")} style={{cursor:"pointer"}}>
            <UserGroupIcon className="card-icon"/>
            Total Employees <br/> {dashboard?.totalEmployees}</div>


      </div>

      
     <h1 style={{marginTop:100}}>Financial Summary</h1>

      <div className="revenue-container">
        
        
        
            <div className="card">
            <CurrencyDollarIcon className="card-icon"/>
             Revenue: ${dashboard?.totalRevenue}</div>
         <div className="card">
          <ArrowPathIcon className="card-icon"/>
               Payment Due: {dashboard?.pendingPayments}</div>
         <div className="card">
          <ScaleIcon className="card-icon"/>
             Occupancy: {dashboard?.occupancyRate}%</div>
      </div>
        


        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}