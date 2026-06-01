import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import "../style.css";

export default function Contracts() {
  const [tenants, setTenants] = useState([]);
  const [contracts, setContracts] = useState([]);

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [contractLength, setContractLength] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const API = "http://localhost:3000";

  const fetchContract = async () => {
    try {
      const res = await fetch(`${API}/contract`);
      const data = await res.json();

      if (res.ok) {
        setContracts(data);
        setError("");
      } else {
        setError(data.error || data.err || "Failed to load contracts");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch(`${API}/tenants`);
      const data = await res.json();

      if (res.ok) {
        setTenants(data);
        setError("");
      } else {
        setError(data.error || data.err || "Failed to load tenants");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    fetchContract();
    fetchTenants();
  }, []);

  const clearForm = () => {
    setTenantId("");
    setAmount("");
    setDate("");
    setContractLength("");
    setPaymentFrequency("");
    setEditingId(null);
  };

  const saveContract = async () => {
    setMessage("");
    setError("");

    if (!tenantId || !amount || !date || !contractLength || !paymentFrequency) {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API}/contract/${editingId}` : `${API}/contract`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            tenant: tenantId,
            amount,
            date,
            contractLength,
            paymentFrequency
          })
        }
      );

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || (editingId ? "Contract updated" : "Contract added"));
        clearForm();
        fetchContract();
      } else {
        setError(data.error || data.err || "Failed to save contract");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editContract = (contract) => {
    setTenantId(contract.tenant?._id || contract.tenant || "");
    setAmount(contract.amount || "");
    setDate(contract.date || "");
    setContractLength(contract.contractLength || "");
    setPaymentFrequency(contract.paymentFrequency || "");
    setEditingId(contract._id);
    setMessage("");
    setError("");
  };

  const deleteContract = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API}/contract/${id}`, {
        method: "DELETE"
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || "Contract deleted");
        fetchContract();
      } else {
        setError(data.error || data.err || "Failed to delete contract");
      }
    } catch (error) {
      setError(error.message);
    }
  };
  const markAsPaid = async (id) => {
  const res = await fetch(`${API}/contract/${id}`, {
    method: "PUT"
  });

  const data = await res.json();

  if (res.ok) {
    setMessage(data.message);
    fetchContract(); 
  } else {
    console.log(data.error);
    setError(error.message);
  }
};

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Contracts</h1>

        <section className="panel">
          <h2>{editingId ? "Edit Contract" : "Add Contract"}</h2>

          <div className="form-grid">
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Select Tenant</option>
              {tenants.map((tenant) => (
                <option key={tenant._id} value={tenant._id}>
                  {tenant.tenantName || tenant.name || `Tenant ${tenant.tenantId}`}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <input
              type="number"
              min="1"
              placeholder="Contract Length (Years)"
              value={contractLength}
              onChange={(e) => setContractLength(e.target.value)}
            />

            <select
              value={paymentFrequency}
              onChange={(e) => setPaymentFrequency(e.target.value)}
            >
              <option value="">Payment Frequency</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Every 6 months">Every 6 months</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <div className="form-actions">
            <button onClick={saveContract}>
              {editingId ? "Update Contract" : "Add Contract"}
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

        <h2>Contracts List</h2>

        <table className="floors-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Amount</th>
              <th>Start Date</th>
              <th>Length</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {contracts.length > 0 ? (
              contracts.map((contract) => (
                <tr key={contract._id}>
                  <td>{contract.tenant?.tenantName || "Tenant"}</td>
                  <td>{contract.amount}</td>
                  <td>{contract.date}</td>
                  <td>{contract.contractLength ? `${contract.contractLength} years` : "-"}</td>
                  <td>{contract.paymentFrequency || "-"}</td>
                    <td> {contract.status === "paid" ? (
                      <span style={{ color: "green" }}>Paid</span>
                     ) : (
                         <span style={{ color: "orange" }}>Pending</span> )}</td>
                         
                  <td>
                    <button onClick={() => editContract(contract)}>
                      Edit
                    </button>
                    <button className="danger-btn" onClick={() => deleteContract(contract._id)}>
                      Delete
                    </button> 
                    {contract.status === "pending" && (
                         <button onClick={() => markAsPaid(contract._id)}> Mark as Paid </button> )}
                   
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">No contracts added yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
