import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import {
  API_BASE,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import "../style.css";

export default function Contracts() {
  const selectedBuildingId = useSelectedBuilding();
  const [tenants, setTenants] = useState([]);
  const [contracts, setContracts] = useState([]);

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("");
  const [contractStatus, setContractStatus] = useState("pending");
  const [editingId, setEditingId] = useState(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearForm = () => {
    setTenantId("");
    setAmount("");
    setLeaseStartDate("");
    setLeaseEndDate("");
    setPaymentFrequency("");
    setContractStatus("pending");
    setEditingId(null);
  };

  const fetchContract = async (useCache = true) => {
    if (!selectedBuildingId) {
      setContracts([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/contract", selectedBuildingId),
      setContracts,
      setError,
      "Failed to load contracts",
      { useCache }
    );
  };

  const fetchTenants = async (useCache = true) => {
    if (!selectedBuildingId) {
      setTenants([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/tenants", selectedBuildingId),
      setTenants,
      setError,
      "Failed to load tenants",
      { useCache }
    );
  };

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    fetchContract();
    fetchTenants();
  }, [selectedBuildingId]);

  const saveContract = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!tenantId || !amount || !leaseStartDate || !leaseEndDate || !paymentFrequency) {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/contract/${editingId}` : `${API_BASE}/contract`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            tenant: tenantId,
            amount,
            date: leaseStartDate,
            leaseStartDate,
            leaseEndDate,
            paymentFrequency,
            status: contractStatus
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Contract updated" : "Contract added"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchContract(false);
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
    setLeaseStartDate(contract.leaseStartDate || contract.date || "");
    setLeaseEndDate(contract.leaseEndDate || "");
    setPaymentFrequency(contract.paymentFrequency || "");
    setContractStatus(contract.status || "pending");
    setEditingId(contract._id);
    setMessage("");
    setError("");
  };

  const deleteContract = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/contract/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Contract deleted");
        invalidateCache(selectedBuildingId);
        fetchContract(false);
      } else {
        setError(data.error || data.err || "Failed to delete contract");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const markAsPaid = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/contract/${id}/pay`, {
        method: "PATCH"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Payment marked as paid");
        invalidateCache(selectedBuildingId);
        fetchContract(false);
      } else {
        setError(data.error || "Failed to mark payment as paid");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Contracts</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing contracts.</p>
        )}

        <section className="panel">
          <h2>{editingId ? "Edit Contract" : "Add Contract"}</h2>

          <div className="form-grid contract-form-grid">
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="">Select Tenant</option>
              {tenants.map((tenant) => (
                <option key={tenant._id} value={tenant._id}>
                  {tenant.tenantName || tenant.name || `Tenant ${tenant.tenantId}`}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Amount (Br)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <label className="field-label">
              Lease Start Date
              <input
                type="date"
                value={leaseStartDate}
                onChange={(e) => setLeaseStartDate(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </label>

            <label className="field-label">
              Lease End Date
              <input
                type="date"
                value={leaseEndDate}
                onChange={(e) => setLeaseEndDate(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </label>

            <select
              value={paymentFrequency}
              onChange={(e) => setPaymentFrequency(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="">Payment Frequency</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Every 6 months">Every 6 months</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <div className="form-actions">
            <button onClick={saveContract} disabled={!selectedBuildingId}>
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
              <th>Lease Start</th>
              <th>Lease End</th>
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
                  <td>Br {contract.amount}</td>
                  <td>{contract.leaseStartDate || contract.date || "-"}</td>
                  <td>{contract.leaseEndDate || "-"}</td>
                  <td>{contract.paymentFrequency || "-"}</td>
                  <td>
                    {contract.status === "paid" ? (
                      <span className="paid-status">Paid</span>
                    ) : (
                      <span className="pending-status">Pending</span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => editContract(contract)}>
                      Edit
                    </button>
                    <button className="danger-btn" onClick={() => deleteContract(contract._id)}>
                      Delete
                    </button>
                    {contract.status === "pending" && (
                      <button onClick={() => markAsPaid(contract._id)}>
                        Mark as Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">No contracts added yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
