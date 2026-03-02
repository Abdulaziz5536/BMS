import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./style.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const login = async () => {
    setMessage("");

    
    if (!email || !password) {
      setMessage("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);

        
        setTimeout(() => {
          navigate("/dashboard"); // change if needed
        }, 1000);

      } else {
        setMessage(data.error);
      }

    } catch (error) {
      setMessage("Server error. Please try again.");
    }

    setLoading(false);
  };

  return (
    <>
      <div className="login">
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

        <button id="login-button" onClick={login} disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
        <br />

        <button
          id="signup-button"
          onClick={() => navigate("/signup")}
        >
          Don’t have an account? Sign Up
        </button>

        <h2>{message}</h2>
      </div>
    </>
  );
}