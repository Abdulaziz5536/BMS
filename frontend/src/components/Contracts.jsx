import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import "../style.css";
import { data } from "react-router-dom";

export default function Contracts() {
  const [tenants, setTenants] = useState([]);
  const [contracts, setContracts] = useState([]);

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  

  const [message, setMessage] = useState("");

  const API = "http://localhost:3000";

  
  const fetchContract = async () => {
    try {
      const res = await fetch(`${API}/contracts`);
      const data = await res.json();
      setContracts(data);
     

    } catch (error) {
      setMessage(error.message);
    }
  };

  const fetchTenants= async () => {
    try {
      const res = await fetch(`${API}/tenants`);
      const data = await res.json();
      setTenantsId(data);
     

    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    fetchContract();
    fetchTenants();
  }, []);

 
  const addContract = async () => {
    if (!tenantId || !amount || !date) {
      setMessage("Fill all fields");
      return;
    }

    try {
      const res = await fetch(`${API}/contracts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenantId,
          amount,
          data
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Contract added");
       fetchContract();
      } else {
        setMessage(data.error);
      }

    } catch (error) {
      setMessage(error.message);
    }
  };


  const deleteContract = async (id) => {
    try {
      const res = await fetch(`${API}/contracts/${id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setMessage(data.message);
        fetchContract();
      }else {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Contracts</h1>

        <div className="floors-form">

          {/* TENANT DROPDOWN */}
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Select Tenant</option>
            {tenants.map(t => (
              <option key={t._id} value={t._id}>
                {t.tenantId}
              </option>
            ))}
          </select>


          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

        

          <button onClick={addContract}>Add Contract</button>
        </div>

        {message && <p>{message}</p>}

        <h2>Contracts List</h2>

        <table className="floors-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Date</th>
              
            </tr>
          </thead>

          <tbody>
            {contracts.map(c => (
              <tr key={c._id}>
                <td>{c.tenantId?.name || "Tenant"}</td>

                <td>{c.date}</td>
            
                <td>
                  <button onClick={() => deleteContract(c._id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

        </table>
      </div>
    </div>
  );
}