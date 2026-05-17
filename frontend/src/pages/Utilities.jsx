import { useEffect, useMemo, useRef, useState } from "react";
import {
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import {
  API_BASE,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import {
  dateInputProps,
  formatEthiopianDate,
  normalizeDateInputForApi
} from "../utils/dateUtils";
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
  const [paymentFrequency, setPaymentFrequency] = useState("Monthly");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("pending");
  const [utilityFile, setUtilityFile] = useState(undefined);

  const [editingId, setEditingId] = useState(null);
  const editUtilityFormRef = useRef(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("tenant");
  const [sortDirection, setSortDirection] = useState("asc");

  const MAX_UPLOAD_SIZE = 7 * 1024 * 1024;

  const readUploadFile = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(undefined);
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        reject(new Error("File must be 7MB or smaller"));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type,
          data: reader.result
        });
      };
      reader.onerror = () => reject(new Error("Failed to read uploaded file"));
      reader.readAsDataURL(file);
    });
  };

  const clearForm = () => {
    setTenantId("");
    setWaterAmount("");
    setLightAmount("");
    setGeneratorGasAmount("");
    setDueDate("");
    setPaymentFrequency("Monthly");
    setUtilityFile(undefined);
    setNotes("");
    setStatus("pending");
    setEditingId(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuildingId]);

  useEffect(() => {
    if (editingId) {
      editUtilityFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const getUtilityTotal = (utility) => (
    (Number(utility.waterAmount) || 0) +
    (Number(utility.lightAmount) || 0) +
    (Number(utility.generatorGasAmount) || 0)
  );

  const filteredAndSortedUtilities = utilities
    .filter(
      (utility) =>
        utility.tenant?.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        utility.tenant?.unit?.unitId?.toString().includes(searchTerm) ||
        utility.status?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === "tenant") {
        aValue = a.tenant?.tenantName || "";
        bValue = b.tenant?.tenantName || "";
      } else if (sortField === "unit") {
        aValue = a.tenant?.unit?.unitId || "";
        bValue = b.tenant?.unit?.unitId || "";
      } else if (sortField === "total") {
        aValue = getUtilityTotal(a);
        bValue = getUtilityTotal(b);
      }

      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const formTotal = useMemo(() => {
    return getUtilityTotal({
      waterAmount,
      lightAmount,
      generatorGasAmount
    });
  }, [waterAmount, lightAmount, generatorGasAmount]);

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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            building: selectedBuildingId,
            tenant: tenantId,
            waterAmount,
            lightAmount,
            generatorGasAmount,
            dueDate,
            paymentFrequency,
            status,
            notes,
            utilityFile
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
    setDueDate(normalizeDateInputForApi(utility.dueDate));
    setPaymentFrequency(utility.paymentFrequency || "Monthly");
    setNotes(utility.notes || "");
    setStatus(utility.status || "pending");
    setUtilityFile(utility.utilityFile || undefined);
    setEditingId(utility._id);
    setMessage("");
    setError("");
  };

  const updateStatus = async (id, nextStatus) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/utilities/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Utility status updated");
        invalidateCache(selectedBuildingId);
        fetchUtilities(false);
      } else {
        setError(data.error || data.err || "Failed to update status");
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
        setError(data.error || data.err || "Failed to delete utility payment");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const markAsPaid = async (id) => {
    // keep for convenience, but status dropdown also works
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
        setError(data.error || data.err || "Failed to mark payment as paid");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const renderFileLink = (file) => {
    if (!file?.data) return "-";
    return (
      <a className="file-link" href={file.data} target="_blank" rel="noreferrer" download={file.name}>
        {file.name}
      </a>
    );
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Utilities</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before adding utility payments.</p>
        )}

        <section className="panel" ref={editUtilityFormRef}>
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
              {...dateInputProps}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <select
              value={paymentFrequency}
              onChange={(e) => setPaymentFrequency(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Every 6 months">Every 6 months</option>
              <option value="Yearly">Yearly</option>
            </select>

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

          <div style={{ marginTop: "1rem" }}>
            <label className="field-label file-field">
              Utility Photo/PDF
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  setError("");
                  setMessage("");
                  try {
                    const file = e.target.files?.[0];
                    const uploaded = await readUploadFile(file);
                    setUtilityFile(uploaded);
                  } catch (err) {
                    setUtilityFile(undefined);
                    setError(err.message);
                    e.target.value = "";
                  }
                }}
                disabled={!selectedBuildingId}
              />
              {utilityFile?.name && <span>{utilityFile.name}</span>}
            </label>

            <div style={{ marginTop: "0.5rem" }}>
              {editingId ? renderFileLink(utilities.find((u) => u._id === editingId)?.utilityFile) : "-"}
            </div>
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

        <div className="table-controls">
          <input
            type="text"
            placeholder="Search utilities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="floors-table-wrapper">
        <table className="floors-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("tenant")} className="sortable-header">
                Tenant {sortField === "tenant" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("unit")} className="sortable-header">
                Unit {sortField === "unit" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th>Water</th>
              <th>Light</th>
              <th>Generator Gas</th>
              <th onClick={() => handleSort("total")} className="sortable-header">
                Total {sortField === "total" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("dueDate")} className="sortable-header">
                Due Date {sortField === "dueDate" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("status")} className="sortable-header">
                Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th>File</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSortedUtilities.length > 0 ? (
              filteredAndSortedUtilities.map((utility) => (
                <tr key={utility._id}>
                  <td>{utility.tenant?.tenantName || "Tenant"}</td>
                  <td>{utility.tenant?.unit?.unitId || "-"}</td>
                  <td>Br {utility.waterAmount || 0}</td>
                  <td>Br {utility.lightAmount || 0}</td>
                  <td>Br {utility.generatorGasAmount || 0}</td>
                  <td>Br {getUtilityTotal(utility)}</td>
                  <td>{formatEthiopianDate(utility.dueDate)}</td>
                  <td>
                    {utility.status === "paid" ? (
                      <span className="paid-status">paid</span>
                    ) : (
                      <span className="pending-status">pending</span>
                    )}
                  </td>
                  <td>{renderFileLink(utility.utilityFile)}</td>
                  <td>
                    <div className="table-action-stack">
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editUtility(utility)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => deleteUtility(utility._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10">No utilities found</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
