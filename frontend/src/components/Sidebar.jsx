import { Link } from "react-router-dom";

export default function Sidebar() {

  return (
    <div className="sidebar" style={{ padding: "20px", height: "100vh" }}>

      <h2>Building Management System</h2>

     <ul>
        <li>
          <Link to="/dashboard">Dashboard</Link>
        </li>
        <li>
          <Link to="/floors">Floors</Link>
        </li>
        <li>
          <Link to="/units">Units</Link>
        </li>
      </ul>

    </div>
  );
}