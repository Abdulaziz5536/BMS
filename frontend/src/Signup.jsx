
import { useState } from "react";
import { useNavigate } from 'react-router-dom';
import "./style.css";


export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  

  const signup = async () => {
    const res = await fetch("http://localhost:3000/signup", { // <-- fixed endpoint
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (res.ok) {
      setMessage(data.message);
    } else {
      setMessage(data.error);
    }
  };

  return (
    <>
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
      <button id="signup-b" onClick={signup}>Sign Up</button>
      <br/>
      <button id="login-b" onClick={() => navigate("/login")} >Already have an account? Login</button>
      <h2>{message}</h2>
      
    </div>
    </>
  );
}
