import { useEffect, useMemo, useState } from "react";
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

export default function Utilities() {
  const selectedBuildingId = useSelectedBuilding();
  const [tenants, setTenants] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [waterAmount, setWaterAmount] = useState("");
  const [lightAmount, setLightAmount] = useState("");
  const [generatorGasAmount, setGeneratorGasAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("pending");
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const formTotal = useMemo(() => {
    return (
      (Number(waterAmount) || 0) +
      (Number(lightAmount) || 0) +
      (Number(generatorGasAmount) || 0)
    );
  }, [waterAmount, lightAmount, generatorGasAmount]);

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

  const fetchUtilities = async (useCache = true) => {
    if (!selectedBuildingId) {
      setUtilities([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/utilities", selectedBuildingId),
      setUtilities,
      setError,
      "Failed to load utilities",
      { useCache }
    );
  };

  useEffect(() => {
    setMessage("");
    setError("");
    clearForm();
    fetchTenants();
    fetchUtilities();
  }, [selectedBuildingId]);

  const clearForm = () => {
    setTenantId("");
    setWaterAmount("");
    setLightAmount("");
    setGeneratorGasAmount("");
    setDueDate("");
    setNotes("");
    setStatus("pending");
    setEditingId(null);
  };

  const saveUtility = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!tenantId) {
      setError("Select a tenant");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/utilities/${editingId}` : `${API_BASE}/utilities`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            tenant: tenantId,
            waterAmount,
            lightAmount,
            generatorGasAmount,
            dueDate,
            status,
            notes
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Utility payment updated" : "Utility payment added"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchUtilities(false);
      } else {
        setError(data.error || "Failed to save utility payment");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editUtility = (utility) => {
    setTenantId(utility.tenant?._id || utility.tenant || "");
    setWaterAmount(utility.waterAmount || "");
    setLightAmount(utility.lightAmount || "");
    setGeneratorGasAmount(utility.generatorGasAmount || "");
    setDueDate(utility.dueDate || "");
    setNotes(utility.notes || "");
    setStatus(utility.status || "pending");
    setEditingId(utility._id);
    setMessage("");
    setError("");
  };

  const markAsPaid = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/utilities/${id}/pay`, {
        method: "PATCH"
      });
      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Utility payment marked as paid");
        invalidateCache(selectedBuildingId);
        fetchUtilities(false);
      } else {
        setError(data.error || "Failed to mark utility payment as paid");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const deleteUtility = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/utilities/${id}`, {
        method: "DELETE"
      });
      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Utility payment deleted");
        invalidateCache(selectedBuildingId);
        fetchUtilities(false);
      } else {
        setError(data.error || "Failed to delete utility payment");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const getUtilityTotal = (utility) => (
    (Number(utility.waterAmount) || 0) +
    (Number(utility.lightAmount) || 0) +
    (Number(utility.generatorGasAmount) || 0)
  );

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Utilities</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before adding utility payments.</p>
        )}

        <section className="panel">
          <h2>{editingId ? "Edit Utility Payment" : "Add Utility Payment"}</h2>

          <div className="form-grid">
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="">Select Tenant</option>
              {tenants.map((tenant) => (
                <option key={tenant._id} value={tenant._id}>
                  {tenant.tenantName} - Unit {tenant.unit?.unitId || "Unassigned"}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Water Amount"
              value={waterAmount}
              onChange={(e) => setWaterAmount(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="number"
              placeholder="Light Amount"
              value={lightAmount}
              onChange={(e) => setLightAmount(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="number"
              placeholder="Generator Gas Amount"
              value={generatorGasAmount}
              onChange={(e) => setGeneratorGasAmount(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>

            <input
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!selectedBuildingId}
            />
          </div>

          <p className="form-total">Total: Br {formTotal}</p>

          <div className="form-actions">
            <button onClick={saveUtility} disabled={!selectedBuildingId}>
              {editingId ? "Update Utility" : "Add Utility"}
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

        <h2>Utilities List</h2>

        <table className="floors-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Unit</th>
              <th>Water</th>
              <th>Light</th>
              <th>Generator Gas</th>
              <th>Total</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {utilities.length > 0 ? (
              utilities.map((utility) => (
                <tr key={utility._id}>
                  <td>{utility.tenant?.tenantName || "Tenant"}</td>
                  <td>{utility.tenant?.unit?.unitId || "-"}</td>
                  <td>Br {utility.waterAmount || 0}</td>
                  <td>Br {utility.lightAmount || 0}</td>
                  <td>Br {utility.generatorGasAmount || 0}</td>
                  <td>Br {getUtilityTotal(utility)}</td>
                  <td>{utility.dueDate || "-"}</td>
                  <td>
                    {utility.status === "paid" ? (
                      <span className="paid-status">Paid</span>
                    ) : (
                      <span className="pending-status">Pending</span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => editUtility(utility)}>
                      Edit
                    </button>
                    <button className="danger-btn" onClick={() => deleteUtility(utility._id)}>
                      Delete
                    </button>
                    {utility.status === "pending" && (
                      <button onClick={() => markAsPaid(utility._id)}>
                        Mark as Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9">No utility payments added yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
