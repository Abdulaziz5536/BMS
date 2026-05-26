import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch, readResponse } from "../buildingSelection";
import { SIGNUP_ENABLED } from "../config";
import useShortError from "../hooks/useShortError";
import "../style.css";

// Signup page creates a basic user account before redirecting to login.
export default function Signup() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useShortError();
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  if (!SIGNUP_ENABLED) {
    return <Navigate to="/login" replace />;
  }

  const signup = async () => {
    // Keep frontend validation aligned with backend auth rules.

    setMessage("");
    setError("");
    
    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email");
      return;
    }

    if (!/^\d{6}$/.test(password)) {
      setError("Password must be exactly 6 digits");
      return;
    }

    setLoading(true);

    try {

      const res = await apiFetch(`${API_BASE}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await readResponse(res);

      if (res.ok) {

        setMessage(data.message);

        setTimeout(() => {
          navigate("/login");
        }, 1000);

      } else {

        setError(data.error);

      }

    } catch {

      setError("Server error. Please try again.");

    }

    setLoading(false);

  };

  return (

    <div className="signup">

      <h1>Sign Up</h1>

      <input
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <br />

      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />

      <input
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />

      <button onClick={signup} disabled={loading}>
        {loading ? "Signing up..." : "Sign Up"}
      </button>

      <br />

      <button
        id="navigate"
        onClick={() => navigate("/login")}
      >
        Already have an account? Login
      </button>

      <h2 className="message">{message}</h2>
      <h2 className="error">{error}</h2>


    </div>
  );
}
