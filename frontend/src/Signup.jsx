import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./style.css";

export default function Signup() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const signup = async () => {

    setMessage("");

    
    if (!name || !email || !password) {
      setMessage("Please fill in all fields");
      return;
    }

    if (!email.includes("@")) {
      setMessage("Enter a valid email");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {

      const res = await fetch("http://localhost:3000/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (res.ok) {

        setMessage(data.message);

        setTimeout(() => {
          navigate("/login");
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

      <h2>{message}</h2>

    </div>
  );
}