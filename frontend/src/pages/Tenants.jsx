import { useState, useEffect } from "react";
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

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

const readUploadFile = (file, expectedType) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      reject(new Error("Upload must be 5MB or smaller"));
      return;
    }

    if (expectedType && file.type !== expectedType) {
      reject(new Error("Lease agreement must be a PDF"));
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

const formatDate = (date) => {
  if (!date) {
    return "-";
  }

  return String(date).slice(0, 10);
};

export default function Tenant() {
  const selectedBuildingId = useSelectedBuilding();
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);

  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [unit, setUnit] = useState("");
  const [idLicenseFile, setIdLicenseFile] = useState(null);
  const [leaseAgreementFile, setLeaseAgreementFile] = useState(null);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingId, setEditingId] = useState(null);

  const [historyTenant, setHistoryTenant] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearForm = () => {
    setTenantId("");
    setTenantName("");
    setPhone("");
    setEmail("");
    setUnit("");
    setIdLicenseFile(null);
    setLeaseAgreementFile(null);
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setEmergencyContactRelation("");
    setMoveInDate("");
    setMoveOutDate("");
    setEditingId(null);
    setFileInputKey((value) => value + 1);
  };

  const fetchUnits = async (useCache = true) => {
    if (!selectedBuildingId) {
      setUnits([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/units", selectedBuildingId),
      setUnits,
      setError,
      "Failed to load units",
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
    setHistoryTenant(null);
    setPaymentHistory([]);
    fetchUnits();
    fetchTenants();
  }, [selectedBuildingId]);

  const handleUpload = async (event, setFile, expectedType) => {
    try {
      setError("");
      const uploadedFile = await readUploadFile(event.target.files?.[0], expectedType);
      setFile(uploadedFile);
    } catch (error) {
      setFile(null);
      setError(error.message);
      event.target.value = "";
    }
  };

  const saveTenant = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!tenantId || !tenantName || !phone || !unit) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/tenants/${editingId}` : `${API_BASE}/tenants`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            tenantId,
            tenantName,
            phone,
            email,
            unit,
            idLicenseFile,
            leaseAgreementFile,
            emergencyContactName,
            emergencyContactPhone,
            emergencyContactRelation,
            moveInDate,
            moveOutDate
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Tenant updated successfully" : "Tenant added successfully"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchTenants(false);
        fetchUnits(false);
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
    setEmail(tenant.email || "");
    setUnit(tenantUnit?._id || tenant.unit || "");
    setIdLicenseFile(tenant.idLicenseFile || null);
    setLeaseAgreementFile(tenant.leaseAgreementFile || null);
    setEmergencyContactName(tenant.emergencyContactName || "");
    setEmergencyContactPhone(tenant.emergencyContactPhone || "");
    setEmergencyContactRelation(tenant.emergencyContactRelation || "");
    setMoveInDate(tenant.moveInDate || "");
    setMoveOutDate(tenant.moveOutDate || "");
    setEditingId(tenant._id);
    setFileInputKey((value) => value + 1);
    setMessage("");
    setError("");
  };

  const deleteTenant = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/tenants/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Tenant deleted successfully");
        invalidateCache(selectedBuildingId);
        fetchTenants(false);
        fetchUnits(false);

        if (historyTenant?._id === id) {
          setHistoryTenant(null);
          setPaymentHistory([]);
        }
      } else {
        setError(data.error || "Failed to delete tenant");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const fetchPaymentHistory = async (tenant) => {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      setHistoryTenant(tenant);

      const res = await fetch(`${API_BASE}/tenants/${tenant._id}/payment-history`);
      const data = await readResponse(res);

      if (res.ok) {
        setPaymentHistory(data);
      } else {
        setHistoryError(data.error || "Failed to load payment history");
      }
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getTenantUnit = (tenant) => {
    if (tenant.unit && typeof tenant.unit === "object") {
      return tenant.unit;
    }

    return units.find((item) => item._id === tenant.unit);
  };

  const renderFileLink = (file, label) => {
    if (!file?.data) {
      return "-";
    }

    return (
      <a className="file-link" href={file.data} target="_blank" rel="noreferrer" download={file.name}>
        {label}
      </a>
    );
  };

  const selectableUnits = units.filter(
    (item) => item.status !== "Occupied" || item._id === unit
  );

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Tenants</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing tenants.</p>
        )}

        <section className="panel tenant-panel">
          <h2>{editingId ? "Edit Tenant" : "Add Tenant"}</h2>

          <div className="form-grid">
            <input
              type="number"
              placeholder="Tenant ID"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              placeholder="Tenant Name"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="">Select Unit</option>
              {selectableUnits.map((item) => (
                <option key={item._id} value={item._id}>
                  Unit {item.unitId} ({item.status || "Available"})
                </option>
              ))}
            </select>

            <input
              placeholder="Emergency Contact Name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="tel"
              placeholder="Emergency Contact Phone"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              placeholder="Emergency Contact Relation"
              value={emergencyContactRelation}
              onChange={(e) => setEmergencyContactRelation(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <label className="field-label">
              Move-in Date
              <input
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </label>

            <label className="field-label">
              Move-out Date
              <input
                type="date"
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </label>

            <label className="field-label file-field">
              ID/License Upload
              <input
                key={`id-${fileInputKey}`}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => handleUpload(e, setIdLicenseFile)}
                disabled={!selectedBuildingId}
              />
              {idLicenseFile?.name && <span>{idLicenseFile.name}</span>}
            </label>

            <label className="field-label file-field">
              Lease Agreement Upload (PDF)
              <input
                key={`lease-${fileInputKey}`}
                type="file"
                accept="application/pdf"
                onChange={(e) => handleUpload(e, setLeaseAgreementFile, "application/pdf")}
                disabled={!selectedBuildingId}
              />
              {leaseAgreementFile?.name && <span>{leaseAgreementFile.name}</span>}
            </label>
          </div>

          <div className="form-actions">
            <button onClick={saveTenant} disabled={!selectedBuildingId}>
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
              <th>Email</th>
              <th>Unit</th>
              <th>Floor</th>
              <th>Move In</th>
              <th>Move Out</th>
              <th>Emergency Contact</th>
              <th>Documents</th>
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
                    <td>{tenant.email || "-"}</td>
                    <td>{tenantUnit?.unitId || "Unassigned"}</td>
                    <td>{tenantUnit?.floor?.floor || "-"}</td>
                    <td>{formatDate(tenant.moveInDate)}</td>
                    <td>{formatDate(tenant.moveOutDate)}</td>
                    <td>
                      {tenant.emergencyContactName || "-"}
                      {tenant.emergencyContactPhone && <><br />{tenant.emergencyContactPhone}</>}
                      {tenant.emergencyContactRelation && <><br />{tenant.emergencyContactRelation}</>}
                    </td>
                    <td>
                      <div className="file-links">
                        {renderFileLink(tenant.idLicenseFile, "ID/License")}
                        {renderFileLink(tenant.leaseAgreementFile, "Lease PDF")}
                      </div>
                    </td>
                    <td>
                      <button onClick={() => editTenant(tenant)}>
                        Edit
                      </button>
                      <button onClick={() => fetchPaymentHistory(tenant)}>
                        Payment History
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
                <td colSpan="11">No tenants added yet</td>
              </tr>
            )}
          </tbody>
        </table>

        {historyTenant && (
          <section className="panel history-panel">
            <h2>Payment History - {historyTenant.tenantName}</h2>
            {historyLoading && <p className="message">Loading payment history...</p>}
            {historyError && <p className="error">{historyError}</p>}

            <table className="floors-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.length > 0 ? (
                  paymentHistory.map((item) => (
                    <tr key={`${item.type}-${item._id}`}>
                      <td>{item.type}</td>
                      <td>{formatDate(item.date)}</td>
                      <td>Br {item.amount}</td>
                      <td>
                        <span className={item.status === "paid" ? "paid-status" : "pending-status"}>
                          {item.status === "paid" ? "Paid" : "Pending"}
                        </span>
                      </td>
                      <td>{item.details || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">No payment history yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
