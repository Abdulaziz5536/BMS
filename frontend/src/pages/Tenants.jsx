import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";

export default function Tenant() {

  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);

  const [tenantId,setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [phone, setPhone] = useState("");
  const [unit, setUnit] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchUnits = async () => {
    const res = await fetch("http://localhost:3000/units");
    const data = await res.json();
    setUnits(data);
  };

  const fetchTenants = async () => {
    const res = await fetch("http://localhost:3000/tenants");
    const data = await res.json();
    setTenants(data);
  };

  useEffect(() => {
    fetchUnits();
    fetchTenants();
  }, []);

  
  const addTenant = async () => {

    const res = await fetch("http://localhost:3000/tenants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tenantId,
        tenantName,
        phone,
        unit
      })
    });

    const data = await res.json();

    if (res.ok) {
      setMessage(data.message);
      fetchTenants();
    } else {
      setError(data.error);
    }
  };

  
  const deleteTenant = async (id) => {
    await fetch(`http://localhost:3000/tenants/${id}`, {
      method: "DELETE"
    });
    fetchTenants();
  };

  return (
    <>
    <div style={{display:"flex"}}>

        <Sidebar />

        <div style={{padding:20}}>

            <h1>Tenants</h1>

      <h3>Add Tenant</h3>

      <input placeholder="Id" onChange={e => setTenantId(e.target.value)} />
      <input placeholder="Name" onChange={e => setTenantName(e.target.value)} />
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input placeholder="Phone" onChange={e => setPhone(e.target.value)} />

      
      <select onChange={e => setUnit(e.target.value)}>
        <option>Select Unit</option>

        {units.map(u => (
          <option key={u._id} value={u._id}>
            Unit {u.unitId}
          </option>
        ))}

      </select>

      <button onClick={addTenant}>Add Tenant</button>

      <h2 className="message">{message}</h2>
      <h2 className="error">{error}</h2>


      <hr />

      <h3>Tenants List</h3>

      {tenants.map(t => (
        <div key={t._id}>

          {t.name} |
          Unit {t.unit?.unitId} |
          Floor {t.unit?.floor?.number}

          <button onClick={() => deleteTenant(t._id)}>❌</button>

        </div>
      ))}


        </div>

        
        


    </div>
      

    </>
  );
}  


