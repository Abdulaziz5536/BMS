import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Dashboard() {

  const navigate = useNavigate();

  
  const token = localStorage.getItem("token");

  useEffect(() => {
    console.log("User token:", token);
    // Later we will use this token to fetch building/floor plan data
  }, [token]);

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="signup">

      <h1>Dashboard</h1>

      <p>You are logged in.</p>

      <button onClick={logout}>
        Logout
      </button>

    </div>
  );
}