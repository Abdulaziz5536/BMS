import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./style.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const login = async () => {
   
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
          navigate("/dashboard"); 
        }, 1000);
      } else {
        setMessage(data.error)
        
      }

    } 

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

      <button onClick={login}>Login</button>
    
      <br />

      <button
        id = "navigate"
        onClick={() => navigate("/signup")}
      >
        Create account
      </button>

      <h2>{message}</h2>
    </div>
    
    </>
    
  );
}