import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="sidebar" style={{ padding: "20px", height: "100vh" }}>
      <h2>Building Management System</h2>

      <ul>
        <li>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? "active" : ""}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to="/floors" className={({ isActive }) => isActive ? "active" : ""}>
            Floors
          </NavLink>
        </li>
        <li>
          <NavLink to="/units" className={({ isActive }) => isActive ? "active" : ""}>
            Units
          </NavLink>
        </li>
      </ul>
    </div>
  );
}