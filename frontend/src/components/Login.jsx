import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, readResponse } from "../buildingSelection";
import "../style.css";

export default function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const login = async () => {

    setMessage("");
    setError("");
   
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {

      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await readResponse(res);

      if (res.ok) {

         
        localStorage.setItem("token", data.token);

        setMessage(data.message);

        setTimeout(() => {
          navigate("/dashboard");
        }, 1000);

      } else {

        if (data.error === "User does not exist") {
          setError("Account does not exist. Please sign up.");
        } 
        else if (data.error === "Invalid credentials") {
          setError("Incorrect password. Try again.");
        } 
        else {
          setError(data.error);
        }

      }

    } catch {

      setError("Server error. Please try again.");

    }

    setLoading(false);

  };

  return (
    <div className="signup">

      <h1>Login</h1>

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

      <button
        id="login-button"
        onClick={login}
        disabled={loading}
      >
        {loading ? "Logging in..." : "Login"}
      </button>

      <br />

      <button
        id="signup-button"
        onClick={() => navigate("/signup")}
      >
        Don’t have an account? Sign Up
      </button>
      <h2 className="message">{message}</h2>
      <h2 className="error">{error}</h2>

    </div>
  );
}
