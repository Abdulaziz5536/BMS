import { useCallback, useState, useEffect, useRef } from "react";
import {
  BanknotesIcon,
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import { confirmAction } from "../components/confirmAction";
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
  normalizeDateInputForApi,
  todayEthiopianDateInputValue
} from "../utils/dateUtils";
import "../style.css";

const formatCurrency = (amount) => {
  return `Br ${Number(amount || 0).toLocaleString()}`;
};

export default function Invoice() {
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
  const [receiptFile, setReceiptFile] = useState(null);
  const [currentInvoiceId, setCurrentInvoiceId] = useState(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const editInvoiceRef = useRef(null);
  const paymentFormRef = useRef(null);
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    dueDate: "",
    periodStart: "",
    periodEnd: "",
    totalAmount: "",
    status: "pending",
    notes: ""
  });

  // UI states
  const [activeTab, setActiveTab] = useState("invoices");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("dueDate");
  const [sortDirection, setSortDirection] = useState("asc");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch data
  const fetchInvoices = useCallback(async (useCache = true) => {
    if (!selectedBuildingId) {
      setInvoices([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/invoices", selectedBuildingId),
      setInvoices,
      setError,
      "Failed to load invoices",
      { useCache }
    );
  }, [selectedBuildingId]);

  const fetchContracts = useCallback(async (useCache = true) => {
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
  }, [selectedBuildingId]);

  const fetchTenants = useCallback(async (useCache = true) => {
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
  }, [selectedBuildingId]);

  const fetchReminders = useCallback(async () => {
    if (!selectedBuildingId) {
      setReminders([]);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/invoices/reminders?building=${selectedBuildingId}`);
      const data = await readResponse(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to load reminders");
      }
      setReminders(data);
    } catch (error) {
      console.error("Failed to load reminders:", error);
    }
  }, [selectedBuildingId]);

  const fetchOverdue = useCallback(async () => {
    if (!selectedBuildingId) {
      setOverdue([]);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/invoices/overdue?building=${selectedBuildingId}`);
      const data = await readResponse(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to load overdue invoices");
      }
      setOverdue(data);
    } catch (error) {
      console.error("Failed to load overdue invoices:", error);
    }
  }, [selectedBuildingId]);

  useEffect(() => {
    setMessage("");
    setError("");
    fetchInvoices();
    fetchContracts();
    fetchTenants();
    fetchReminders();
    fetchOverdue();
  }, [fetchContracts, fetchInvoices, fetchOverdue, fetchReminders, fetchTenants, selectedBuildingId]);

  useEffect(() => {
    if (editingInvoiceId) {
      editInvoiceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingInvoiceId]);

  useEffect(() => {
    if (currentInvoiceId) {
      paymentFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [currentInvoiceId]);

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
      const res = await fetch(`${API_BASE}/invoices/generate`, {
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
      const res = await fetch(`${API_BASE}/invoices/auto-generate`, {
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

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const commaIndex = result.indexOf(',');
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        } else {
          resolve('');
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
      let receiptPayload;
      if (receiptFile) {
        const receiptData = await readFileAsBase64(receiptFile);
        receiptPayload = {
          name: receiptFile.name,
          type: receiptFile.type,
          data: receiptData
        };
      }

      const res = await fetch(`${API_BASE}/invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentDate,
          amount: Number(paymentAmount),
          paymentMethod,
          reference,
          notes,
          receipt: receiptPayload
        })
      });

      const data = await readResponse(res);
      if (res.ok) {
        setMessage("Payment recorded successfully");
        setCurrentInvoiceId(null);
        invalidateCache(selectedBuildingId);
        fetchInvoices(false);
        fetchOverdue();
        // Reset form
        setPaymentAmount("");
        setPaymentDate("");
        setReference("");
        setNotes("");
        setReceiptFile(null);
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditingInvoice = (invoice) => {
    setMessage("");
    setError("");
    setCurrentInvoiceId(null);
    setEditingInvoiceId(invoice._id);
    setEditInvoiceForm({
      dueDate: normalizeDateInputForApi(invoice.dueDate),
      periodStart: normalizeDateInputForApi(invoice.periodStart),
      periodEnd: normalizeDateInputForApi(invoice.periodEnd),
      totalAmount: String(invoice.rentAmount || invoice.totalAmount || ""),
      status: invoice.status || "pending",
      notes: invoice.notes || ""
    });
  };

  const cancelEditingInvoice = () => {
    setEditingInvoiceId(null);
    setEditInvoiceForm({
      dueDate: "",
      periodStart: "",
      periodEnd: "",
      totalAmount: "",
      status: "pending",
      notes: ""
    });
  };

  const updateInvoice = async () => {
    setMessage("");
    setError("");

    if (!editingInvoiceId) {
      setError("Invoice ID is missing");
      return;
    }

    if (!editInvoiceForm.dueDate || !editInvoiceForm.totalAmount) {
      setError("Due date and total amount are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/invoices/${editingInvoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueDate: editInvoiceForm.dueDate,
          periodStart: editInvoiceForm.periodStart,
          periodEnd: editInvoiceForm.periodEnd,
          totalAmount: Number(editInvoiceForm.totalAmount),
          status: editInvoiceForm.status,
          notes: editInvoiceForm.notes
        })
      });
      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Invoice updated");
        cancelEditingInvoice();
        invalidateCache(selectedBuildingId);
        fetchInvoices(false);
        fetchReminders();
        fetchOverdue();
      } else {
        setError(data.error || "Failed to update invoice");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteInvoice = async (invoice) => {
    const shouldDelete = await confirmAction({
      title: "Delete invoice?",
      message: `Are you sure you want to delete invoice ${invoice.invoiceNumber}? This also removes its payment records.`,
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/invoices/${invoice._id}`, {
        method: "DELETE"
      });
      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Invoice deleted successfully");
        invalidateCache(selectedBuildingId);

        if (currentInvoiceId === invoice._id) {
          setCurrentInvoiceId(null);
        }

        if (editingInvoiceId === invoice._id) {
          cancelEditingInvoice();
        }

        fetchInvoices(false);
        fetchReminders();
        fetchOverdue();
      } else {
        setError(data.error || "Failed to delete invoice");
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
        <h1>Invoice Management</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing invoices.</p>
        )}

        {/* Tab Navigation */}
        <div className="invoice-tabs">
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
            <h2>Generate Invoice</h2>
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

            <div className="floors-table-wrapper invoice-table-wrapper">
            <table className="floors-table invoice-table">
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
                    Total {sortField === "amount" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th>Paid</th>
                  <th>Outstanding</th>
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
                        {formatEthiopianDate(invoice.periodStart)} - {formatEthiopianDate(invoice.periodEnd)}
                      </td>
                      <td>{formatEthiopianDate(invoice.dueDate)}</td>
                      <td>{formatCurrency(invoice.totalAmount)}</td>
                      <td>{formatCurrency(invoice.amountPaid || 0)}</td>
                      <td>{formatCurrency(invoice.outstandingBalance ?? (invoice.totalAmount - (invoice.amountPaid || 0)))}</td>
                      <td>{getStatusBadge(invoice.status)}</td>
                      <td>
                        <div className="table-action-stack invoice-row-actions">
                          <button className="table-action-btn" onClick={() => startEditingInvoice(invoice)}>
                            <PencilSquareIcon />
                            <span>Edit</span>
                          </button>
                          {invoice.status === "pending" && (
                            <button className="table-action-btn payment-action-btn" onClick={() => {
                              setMessage("");
                              setError("");
                              setEditingInvoiceId(null);
                              setCurrentInvoiceId(invoice._id);
                              const outstanding = invoice.outstandingBalance ?? (invoice.totalAmount - (invoice.amountPaid || 0));
                              setPaymentAmount(outstanding.toString());
                              setPaymentDate(todayEthiopianDateInputValue());
                              setReceiptFile(null);
                            }}>
                              <BanknotesIcon />
                              <span>Record Payment</span>
                            </button>
                          )}
                          <button
                            className="table-action-btn danger-btn"
                            onClick={() => deleteInvoice(invoice)}
                            disabled={loading}
                          >
                            <TrashIcon />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9">No invoices found</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
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
                      <span>Due: {formatEthiopianDate(reminder.dueDate)}</span>
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
                      <span>Due: {formatEthiopianDate(item.dueDate)}</span>
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
          <section className="panel payment-form" ref={paymentFormRef}>
            <h2>Record Payment</h2>
            <div className="form-grid">
              <input
                type="number"
                placeholder="Payment Amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <input
                {...dateInputProps}
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
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            />
            {receiptFile && (
              <p className="small-info">Selected receipt: {receiptFile.name}</p>
            )}
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

        {editingInvoiceId && (
          <section className="panel payment-form" ref={editInvoiceRef}>
            <h2>Edit Invoice</h2>
            <div className="form-grid">
              <label className="field-label">
                Period Start
                <input
                  {...dateInputProps}
                  value={editInvoiceForm.periodStart}
                  onChange={(e) => setEditInvoiceForm((current) => ({
                    ...current,
                    periodStart: e.target.value
                  }))}
                />
              </label>

              <label className="field-label">
                Period End
                <input
                  {...dateInputProps}
                  value={editInvoiceForm.periodEnd}
                  onChange={(e) => setEditInvoiceForm((current) => ({
                    ...current,
                    periodEnd: e.target.value
                  }))}
                />
              </label>

              <label className="field-label">
                Due Date
                <input
                  {...dateInputProps}
                  value={editInvoiceForm.dueDate}
                  onChange={(e) => setEditInvoiceForm((current) => ({
                    ...current,
                    dueDate: e.target.value
                  }))}
                />
              </label>

              <label className="field-label">
                Total Amount
                <input
                  type="number"
                  min="1"
                  value={editInvoiceForm.totalAmount}
                  onChange={(e) => setEditInvoiceForm((current) => ({
                    ...current,
                    totalAmount: e.target.value
                  }))}
                />
              </label>

              <label className="field-label">
                Status
                <select
                  value={editInvoiceForm.status}
                  onChange={(e) => setEditInvoiceForm((current) => ({
                    ...current,
                    status: e.target.value
                  }))}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            <textarea
              placeholder="Invoice notes"
              value={editInvoiceForm.notes}
              onChange={(e) => setEditInvoiceForm((current) => ({
                ...current,
                notes: e.target.value
              }))}
              rows="3"
            />

            <div className="form-actions">
              <button onClick={updateInvoice} disabled={loading}>
                Save Invoice
              </button>
              <button className="secondary-btn" onClick={cancelEditingInvoice} disabled={loading}>
                Cancel
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
