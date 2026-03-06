import { Link } from "react-router-dom";

export default function Sidebar() {

  return (
    <div className="sidebar">

      <h2>Hotel System</h2>

      <Link to="/dashboard">Dashboard</Link>

      <Link to="/floors">Floors</Link>

    </div>
  );
}