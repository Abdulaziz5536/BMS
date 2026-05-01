import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import "../style.css";

export default function Tenant() {
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);

  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [phone, setPhone] = useState("");
  const [unit, setUnit] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchUnits = async () => {
    try {
      const res = await fetch("http://localhost:3000/units");
      const data = await res.json();
      setUnits(data);
    } catch (error) {
      setError(error.message);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch("http://localhost:3000/tenants");
      const data = await res.json();
      setTenants(data);
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    fetchUnits();
    fetchTenants();
  }, []);

  const clearForm = () => {
    setTenantId("");
    setTenantName("");
    setPhone("");
    setUnit("");
    setEditingId(null);
  };

  const saveTenant = async () => {
    setMessage("");
    setError("");

    if (!tenantId || !tenantName || !phone || !unit) {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId
          ? `http://localhost:3000/tenants/${editingId}`
          : "http://localhost:3000/tenants",
        {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenantId,
          tenantName,
          phone,
          unit
        })
      }
      );

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (res.ok) {
        setMessage(data.message || (editingId ? "Tenant updated successfully" : "Tenant added successfully"));
        clearForm();
        fetchTenants();
      } else {
        setError(data.error || "Failed to save tenant");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editTenant = (tenant) => {
    const tenantUnit = getTenantUnit(tenant);

    setTenantId(tenant.tenantId || "");
    setTenantName(tenant.tenantName || "");
    setPhone(tenant.phone || "");
    setUnit(tenantUnit?._id || tenant.unit || "");
    setEditingId(tenant._id);
    setMessage("");
    setError("");
  };

  const deleteTenant = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`http://localhost:3000/tenants/${id}`, {
        method: "DELETE"
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || "Tenant deleted successfully");
        fetchTenants();
      } else {
        setError(data.error || "Failed to delete tenant");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const getTenantUnit = (tenant) => {
    if (tenant.unit && typeof tenant.unit === "object") {
      return tenant.unit;
    }

    return units.find((item) => item._id === tenant.unit);
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Tenants</h1>

        <section className="panel">
          <h2>Add Tenant</h2>

          <div className="form-grid">
            <input
              type="number"
              placeholder="Tenant ID"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />

            <input
              placeholder="Tenant Name"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
            />

            <input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Select Unit</option>
              {units.map((item) => (
                <option key={item._id} value={item._id}>
                  Unit {item.unitId}
                </option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button onClick={saveTenant}>
              {editingId ? "Update Tenant" : "Add Tenant"}
            </button>

            {editingId && (
              <button className="secondary-btn" onClick={clearForm}>
                Cancel
              </button>
            )}
          </div>
        </section>

        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        <h2>Tenants List</h2>

        <table className="floors-table">
          <thead>
            <tr>
              <th>Tenant ID</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Unit</th>
              <th>Floor</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {tenants.length > 0 ? (
              tenants.map((tenant) => {
                const tenantUnit = getTenantUnit(tenant);

                return (
                  <tr key={tenant._id}>
                    <td>{tenant.tenantId}</td>
                    <td>{tenant.tenantName}</td>
                    <td>{tenant.phone}</td>
                    <td>{tenantUnit?.unitId || "Unassigned"}</td>
                    <td>{tenantUnit?.floor?.floor || "No floor"}</td>
                    <td>
                      <button onClick={() => editTenant(tenant)}>
                        Edit
                      </button>
                      <button className="danger-btn" onClick={() => deleteTenant(tenant._id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6">No tenants added yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
