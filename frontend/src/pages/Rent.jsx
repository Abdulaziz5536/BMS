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

const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString('en-GB'); // DD/MM/YYYY format
};

const formatCurrency = (amount) => {
  return `Br ${Number(amount || 0).toLocaleString()}`;
};

export default function Rent() {
  const selectedBuildingId = useSelectedBuilding();
  const [invoices, setInvoices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [overdue, setOverdue] = useState([]);

  // Form states
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedContract, setSelectedContract] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [currentInvoiceId, setCurrentInvoiceId] = useState(null);

  // UI states
  const [activeTab, setActiveTab] = useState("invoices");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("dueDate");
  const [sortDirection, setSortDirection] = useState("asc");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch data
  const fetchInvoices = async (useCache = true) => {
    if (!selectedBuildingId) {
      setInvoices([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/rent-invoices", selectedBuildingId),
      setInvoices,
      setError,
      "Failed to load rent invoices",
      { useCache }
    );
  };

  const fetchContracts = async (useCache = true) => {
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

  const fetchReminders = async () => {
    if (!selectedBuildingId) return;

    try {
      const res = await fetch(`${API_BASE}/rent-invoices/reminders?building=${selectedBuildingId}`);
      const data = await readResponse(res);
      setReminders(data);
    } catch (error) {
      console.error("Failed to load reminders:", error);
    }
  };

  const fetchOverdue = async () => {
    if (!selectedBuildingId) return;

    try {
      const res = await fetch(`${API_BASE}/rent-invoices/overdue?building=${selectedBuildingId}`);
      const data = await readResponse(res);
      setOverdue(data);
    } catch (error) {
      console.error("Failed to load overdue invoices:", error);
    }
  };

  useEffect(() => {
    setMessage("");
    setError("");
    fetchInvoices();
    fetchContracts();
    fetchTenants();
    fetchReminders();
    fetchOverdue();
  }, [selectedBuildingId]);

  // Filter and sort invoices
  const filteredAndSortedInvoices = invoices
    .filter((invoice) =>
      invoice.tenant?.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.status?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === "tenant") {
        aValue = a.tenant?.tenantName || "";
        bValue = b.tenant?.tenantName || "";
      } else if (sortField === "amount") {
        aValue = a.totalAmount || 0;
        bValue = b.totalAmount || 0;
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

  // Generate invoice for selected tenant/contract
  const generateInvoice = async () => {
    if (!selectedTenant || !selectedContract) {
      setError("Please select both tenant and contract");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rent-invoices/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant,
          contractId: selectedContract
        })
      });

      const data = await readResponse(res);
      if (res.ok) {
        setMessage(data.message);
        fetchInvoices(false);
        fetchReminders();
        setSelectedTenant("");
        setSelectedContract("");
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate invoices for all active contracts
  const autoGenerateInvoices = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rent-invoices/auto-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: selectedBuildingId
        })
      });

      const data = await readResponse(res);
      if (res.ok) {
        setMessage(data.message);
        fetchInvoices(false);
        fetchReminders();
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Record payment
  const recordPayment = async (invoiceId) => {
    if (!invoiceId) {
      setError("Invoice ID is missing");
      return;
    }

    if (!paymentAmount || !paymentDate) {
      setError("Please enter payment amount and date");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rent-invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentDate,
          amount: Number(paymentAmount),
          paymentMethod,
          reference,
          notes
        })
      });

      const data = await readResponse(res);
      if (res.ok) {
        setMessage("Payment recorded successfully");
        setCurrentInvoiceId(null);
        fetchInvoices(false);
        fetchOverdue();
        // Reset form
        setPaymentAmount("");
        setPaymentDate("");
        setReference("");
        setNotes("");
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const classes = {
      pending: "pending-status",
      paid: "paid-status",
      overdue: "danger-btn",
      cancelled: "secondary-btn"
    };
    return <span className={classes[status] || "pending-status"}>{status}</span>;
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Rent Management</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing rent.</p>
        )}

        {/* Tab Navigation */}
        <div className="rent-tabs">
          <button
            className={activeTab === "invoices" ? "active" : ""}
            onClick={() => setActiveTab("invoices")}
          >
            Invoices ({invoices.length})
          </button>
          <button
            className={activeTab === "reminders" ? "active" : ""}
            onClick={() => setActiveTab("reminders")}
          >
            Due Soon ({reminders.length})
          </button>
          <button
            className={activeTab === "overdue" ? "active" : ""}
            onClick={() => setActiveTab("overdue")}
          >
            Overdue ({overdue.length})
          </button>
        </div>

        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        {/* Invoice Generation Section */}
        {activeTab === "invoices" && (
          <section className="panel">
            <h2>Generate Rent Invoice</h2>
            <div className="form-grid">
              <select
                value={selectedTenant}
                onChange={(e) => {
                  setSelectedTenant(e.target.value);
                  setSelectedContract("");
                }}
                disabled={!selectedBuildingId}
              >
                <option value="">Select Tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant._id} value={tenant._id}>
                    {tenant.tenantName} - Unit {tenant.unit?.unitId || "Unassigned"}
                  </option>
                ))}
              </select>

              <select
                value={selectedContract}
                onChange={(e) => setSelectedContract(e.target.value)}
                disabled={!selectedTenant || !selectedBuildingId}
              >
                <option value="">Select Contract</option>
                {contracts
                  .filter((contract) => String(contract.tenant?._id) === String(selectedTenant))
                  .map((contract) => (
                    <option key={contract._id} value={contract._id}>
                      {contract.paymentFrequency} - {formatCurrency(contract.amount)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-actions">
              <button onClick={generateInvoice} disabled={loading || !selectedBuildingId}>
                Generate Invoice
              </button>
              <button onClick={autoGenerateInvoices} disabled={loading || !selectedBuildingId}>
                Auto-Generate All
              </button>
            </div>
          </section>
        )}

        {/* Invoices List */}
        {activeTab === "invoices" && (
          <>
            <div className="table-controls">
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <table className="floors-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort("invoiceNumber")} className="sortable-header">
                    Invoice # {sortField === "invoiceNumber" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th onClick={() => handleSort("tenant")} className="sortable-header">
                    Tenant {sortField === "tenant" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th>Period</th>
                  <th onClick={() => handleSort("dueDate")} className="sortable-header">
                    Due Date {sortField === "dueDate" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th onClick={() => handleSort("amount")} className="sortable-header">
                    Amount {sortField === "amount" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th onClick={() => handleSort("status")} className="sortable-header">
                    Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedInvoices.length > 0 ? (
                  filteredAndSortedInvoices.map((invoice) => (
                    <tr key={invoice._id}>
                      <td>{invoice.invoiceNumber}</td>
                      <td>{invoice.tenant?.tenantName || "Tenant"}</td>
                      <td>
                        {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                      </td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>{formatCurrency(invoice.totalAmount)}</td>
                      <td>{getStatusBadge(invoice.status)}</td>
                      <td>
                        {invoice.status === "pending" && (
                          <div className="action-buttons">
                            <button onClick={() => {
                              setCurrentInvoiceId(invoice._id);
                              setPaymentAmount(invoice.totalAmount.toString());
                              setPaymentDate(new Date().toISOString().split('T')[0]);
                              // Show payment modal/form
                            }}>
                              Record Payment
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7">No invoices found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {/* Due Date Reminders */}
        {activeTab === "reminders" && (
          <section className="panel">
            <h2>Upcoming Due Dates</h2>
            {reminders.length > 0 ? (
              <div className="reminders-list">
                {reminders.map((reminder) => (
                  <div key={reminder.invoiceId} className="reminder-item">
                    <div className="reminder-header">
                      <strong>{reminder.tenantName}</strong>
                      <span className="reminder-amount">{formatCurrency(reminder.amount)}</span>
                    </div>
                    <div className="reminder-details">
                      <span>Due: {formatDate(reminder.dueDate)}</span>
                      <span className={reminder.daysUntilDue <= 3 ? "urgent" : "warning"}>
                        {reminder.daysUntilDue <= 0 ? "Overdue" : `${reminder.daysUntilDue} days left`}
                      </span>
                    </div>
                    <div className="reminder-contact">
                      Phone: {reminder.tenantPhone} | Email: {reminder.tenantEmail}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No upcoming due dates</p>
            )}
          </section>
        )}

        {/* Overdue Invoices */}
        {activeTab === "overdue" && (
          <section className="panel">
            <h2>Overdue Payments</h2>
            {overdue.length > 0 ? (
              <div className="overdue-list">
                {overdue.map((item) => (
                  <div key={item.invoiceId} className="overdue-item">
                    <div className="overdue-header">
                      <strong>{item.tenantName}</strong>
                      <span className="overdue-amount">{formatCurrency(item.totalAmount)}</span>
                    </div>
                    <div className="overdue-details">
                      <span>Due: {formatDate(item.dueDate)}</span>
                      <span className="overdue-days">{item.daysOverdue} days overdue</span>
                      <span className="late-penalty">Late Penalty: {formatCurrency(item.latePenalty)}</span>
                    </div>
                    <div className="overdue-contact">
                      Phone: {item.tenantPhone} | Email: {item.tenantEmail}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No overdue payments</p>
            )}
          </section>
        )}

        {/* Payment Recording Modal/Form - Simple inline form for now */}
        {currentInvoiceId && (
          <section className="panel payment-form">
            <h2>Record Payment</h2>
            <div className="form-grid">
              <input
                type="number"
                placeholder="Payment Amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                placeholder="Reference/Receipt Number"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <textarea
              placeholder="Payment Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows="3"
            />
            <div className="form-actions">
              <button onClick={() => recordPayment(currentInvoiceId)} disabled={loading}>
                Record Payment
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  setCurrentInvoiceId(null);
                  setPaymentAmount("");
                  setPaymentDate("");
                  setReference("");
                  setNotes("");
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}