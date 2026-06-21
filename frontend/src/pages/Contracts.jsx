import { useEffect, useRef, useState } from "react";
import {
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import { confirmAction } from "../components/confirmAction";
import FilePreviewLink from "../components/FilePreviewLink";
import {
  API_BASE,
  apiFetch,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import useShortError from "../hooks/useShortError";
import {
  dateInputProps,
  formatEthiopianDate,
  normalizeDateInputForApi
} from "../utils/dateUtils";
import {
  buildCustomPaymentFrequency,
  CUSTOM_PAYMENT_FREQUENCY,
  formatPaymentFrequency,
  getPaymentFrequencyFormState,
  PAYMENT_FREQUENCY_OPTIONS
} from "../utils/paymentFrequencyUtils";
import "../style.css";

const MAX_UPLOAD_SIZE = 7 * 1024 * 1024; // 7MB

// Contracts page manages rent agreements. Contract date/frequency changes can recalculate invoices.

const readUploadFile = (file) => {
  // Browser FileReader converts uploaded PDFs/photos into data URLs for the backend.
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

export default function Contracts() {
  const selectedBuildingId = useSelectedBuilding();
  const [tenants, setTenants] = useState([]);
  const [contracts, setContracts] = useState([]);

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("");
  const [customPaymentFrequencyMonths, setCustomPaymentFrequencyMonths] = useState("");
  const [contractStatus, setContractStatus] = useState("pending");

  const [contractFile, setContractFile] = useState(undefined);

  const [editingId, setEditingId] = useState(null);
  const contractFormRef = useRef(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useShortError();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("status");
  const [sortDirection, setSortDirection] = useState("desc");

  const clearForm = () => {
    setTenantId("");
    setAmount("");
    setLeaseStartDate("");
    setLeaseEndDate("");
    setPaymentFrequency("");
    setCustomPaymentFrequencyMonths("");
    setContractStatus("pending");
    setContractFile(undefined);
    setEditingId(null);
  };

  const fetchContract = async (useCache = true) => {
    // Contracts are building-scoped and include populated tenant/unit data.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuildingId]);

  useEffect(() => {
    if (editingId) {
      contractFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const filteredAndSortedContracts = contracts
    .filter(
      (contract) =>
        contract.tenant?.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.tenant?.tenantId?.toString().includes(searchTerm) ||
        formatPaymentFrequency(contract.paymentFrequency).toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.status?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === "tenant") {
        aValue = a.tenant?.tenantName || "";
        bValue = b.tenant?.tenantName || "";
      } else if (sortField === "amount") {
        aValue = Number(a.amount) || 0;
        bValue = Number(b.amount) || 0;
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

  const saveContract = async () => {
    // The backend validates dates/tenant ownership and syncs related invoice periods.
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    const savedPaymentFrequency = paymentFrequency === CUSTOM_PAYMENT_FREQUENCY
      ? buildCustomPaymentFrequency(customPaymentFrequencyMonths)
      : paymentFrequency;

    if (!tenantId || !amount || !leaseStartDate || !leaseEndDate || !savedPaymentFrequency) {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await apiFetch(
        editingId ? withBuilding(`/contract/${editingId}`, selectedBuildingId) : `${API_BASE}/contract`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            building: selectedBuildingId,
            tenant: tenantId,
            amount,
            date: leaseStartDate,
            leaseStartDate,
            leaseEndDate,
            paymentFrequency: savedPaymentFrequency,
            status: contractStatus,
            contractFile
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
    } catch (err) {
      setError(err.message);
    }
  };

  const editContract = (contract) => {
    // Editing copies stored values into the form and scrolls the user back to it.
    setTenantId(contract.tenant?._id || contract.tenant || "");
    setAmount(contract.amount || "");
    setLeaseStartDate(normalizeDateInputForApi(contract.leaseStartDate || contract.date));
    setLeaseEndDate(normalizeDateInputForApi(contract.leaseEndDate));
    const frequencyState = getPaymentFrequencyFormState(contract.paymentFrequency);
    setPaymentFrequency(frequencyState.paymentFrequency);
    setCustomPaymentFrequencyMonths(frequencyState.customMonths);
    setContractStatus(contract.status || "pending");
    setContractFile(contract.contractFile || undefined);
    setEditingId(contract._id);
    setMessage("");
    setError("");
  };

  const deleteContract = async (id) => {
    // Backend cascades contract deletion through related invoices and payment records.
    const shouldDelete = await confirmAction({
      title: "Delete contract?",
      message: "Are you sure you want to delete this contract? Related invoices and payment records will also be removed.",
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const res = await apiFetch(withBuilding(`/contract/${id}`, selectedBuildingId), {
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
    } catch (err) {
      setError(err.message);
    }
  };

  const renderFileLink = (file) => {
    if (!file?.data) return "-";
    return <FilePreviewLink file={file} />;
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <h1>Contracts</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing contracts.</p>
        )}

        <section className="panel" ref={contractFormRef}>
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
                {...dateInputProps}
                value={leaseStartDate}
                onChange={(e) => setLeaseStartDate(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </label>

            <label className="field-label">
              Lease End Date
              <input
                {...dateInputProps}
                value={leaseEndDate}
                onChange={(e) => setLeaseEndDate(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </label>

            <select
              value={paymentFrequency}
              onChange={(e) => {
                setPaymentFrequency(e.target.value);
                if (e.target.value !== CUSTOM_PAYMENT_FREQUENCY) {
                  setCustomPaymentFrequencyMonths("");
                }
              }}
              disabled={!selectedBuildingId}
            >
              <option value="">Payment Frequency</option>
              {PAYMENT_FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            {paymentFrequency === CUSTOM_PAYMENT_FREQUENCY && (
              <input
                type="number"
                min="2"
                step="1"
                placeholder="Every X months"
                value={customPaymentFrequencyMonths}
                onChange={(e) => setCustomPaymentFrequencyMonths(e.target.value)}
                disabled={!selectedBuildingId}
              />
            )}

            <select
              value={contractStatus}
              onChange={(e) => setContractStatus(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="pending">pending</option>
              <option value="paid">paid</option>
            </select>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <label className="field-label file-field">
              Contract Photo/PDF
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  setError("");
                  setMessage("");
                  try {
                    const file = e.target.files?.[0];
                    const uploaded = await readUploadFile(file);
                    setContractFile(uploaded);
                  } catch (err) {
                    setContractFile(undefined);
                    setError(err.message);
                    e.target.value = "";
                  }
                }}
                disabled={!selectedBuildingId}
              />
              {contractFile?.name && <span>{contractFile.name}</span>}
            </label>

            <div style={{ marginTop: "0.5rem" }}>
              {editingId ? renderFileLink(contracts.find((c) => c._id === editingId)?.contractFile) : "-"}
            </div>
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

        <div className="table-controls">
          <input
            type="text"
            placeholder="Search contracts..."
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
              <th onClick={() => handleSort("amount")} className="sortable-header">
                Amount {sortField === "amount" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("leaseStartDate")} className="sortable-header">
                Lease Start {sortField === "leaseStartDate" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("leaseEndDate")} className="sortable-header">
                Lease End {sortField === "leaseEndDate" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("paymentFrequency")} className="sortable-header">
                Payment {sortField === "paymentFrequency" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("status")} className="sortable-header">
                Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th>File</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSortedContracts.length > 0 ? (
              filteredAndSortedContracts.map((contract) => (
                <tr key={contract._id}>
                  <td>{contract.tenant?.tenantName || "Tenant"}</td>
                  <td>Br {contract.amount}</td>
                  <td>{formatEthiopianDate(contract.leaseStartDate || contract.date)}</td>
                  <td>{formatEthiopianDate(contract.leaseEndDate)}</td>
                  <td>{formatPaymentFrequency(contract.paymentFrequency) || "-"}</td>
                  <td>
                    {contract.status === "paid" ? (
                      <span className="paid-status">Paid</span>
                    ) : (
                      <span className="pending-status">Pending</span>
                    )}
                  </td>
                  <td>{renderFileLink(contract.contractFile)}</td>
                  <td>
                    <div className="table-action-stack">
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editContract(contract)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => deleteContract(contract._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8">No contracts found</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
