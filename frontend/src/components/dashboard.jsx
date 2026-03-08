import Sidebar from "../components/Sidebar";
import "../style.css";

export default function Dashboard() {
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

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}