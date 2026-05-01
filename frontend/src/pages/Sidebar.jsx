import { NavLink } from "react-router-dom";



export default function Sidebar() {
  return (
    <div className="sidebar">
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
        <li>
          <NavLink to="/tenants" className={({ isActive }) => isActive ? "active" : ""}>
            Tenants
          </NavLink>
        </li>

       
        <li>
          <NavLink to="/contracts" className={({ isActive }) => isActive ? "active" : ""}>
            Contracts
          </NavLink>
        </li>
        <li>
          <NavLink to="/employees" className={({ isActive }) => isActive ? "active" : ""}>
            Employees
          </NavLink>
        </li>

      </ul>
  </div> );
}
