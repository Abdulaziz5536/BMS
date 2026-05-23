import Sidebar from "./Sidebar";
import "../style.css";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellAlertIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  KeyIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  PhoneIcon,
  EnvelopeIcon,
  ScaleIcon
} from "@heroicons/react/24/outline";
import {
  API_BASE,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import { formatEthiopianDate } from "../utils/dateUtils";

const formatCurrency = (amount) => `Br ${Number(amount || 0).toLocaleString()}`;

export default function Dashboard() {
  const navigate = useNavigate();
  const selectedBuildingId = useSelectedBuilding();
  const [dashboard, setDashboard] = useState({});
  const [error, setError] = useState("");
  const [paymentAlerts, setPaymentAlerts] = useState({ dueSoon: [], overdue: [] });
  const [paymentAlertError, setPaymentAlertError] = useState("");
  const [paymentAlertsLoading, setPaymentAlertsLoading] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  const fetchDashboard = useCallback(async () => {
    if (!selectedBuildingId) {
      setDashboard({});
      return;
    }

    await loadCachedJson(
      withBuilding("/dashboard", selectedBuildingId),
      setDashboard,
      setError,
      "Failed to load dashboard"
    );
  }, [selectedBuildingId]);

  const fetchPaymentAlerts = useCallback(async () => {
    if (!selectedBuildingId) {
      setPaymentAlerts({ dueSoon: [], overdue: [] });
      setPaymentAlertError("");
      return;
    }

    setPaymentAlertsLoading(true);
    setPaymentAlertError("");

    try {
      const [dueRes, overdueRes] = await Promise.all([
        fetch(withBuilding("/invoices/reminders", selectedBuildingId)),
        fetch(withBuilding("/invoices/overdue", selectedBuildingId))
      ]);
      const [dueData, overdueData] = await Promise.all([
        readResponse(dueRes),
        readResponse(overdueRes)
      ]);

      if (!dueRes.ok) {
        throw new Error(dueData.error || "Failed to load due payments");
      }

      if (!overdueRes.ok) {
        throw new Error(overdueData.error || "Failed to load overdue payments");
      }

      setPaymentAlerts({
        dueSoon: Array.isArray(dueData) ? dueData : [],
        overdue: Array.isArray(overdueData) ? overdueData : []
      });
    } catch (error) {
      setPaymentAlertError(error.message);
    } finally {
      setPaymentAlertsLoading(false);
    }
  }, [selectedBuildingId]);

  useEffect(() => {
    fetchDashboard();
    fetchPaymentAlerts();
  }, [fetchDashboard, fetchPaymentAlerts]);

  const sendRemindersNow = async () => {
    if (!selectedBuildingId) {
      setReminderResult(null);
      setPaymentAlertError("Select a building before sending reminders.");
      return;
    }

    setReminderLoading(true);
    setReminderResult(null);
    setPaymentAlertError("");

    try {
      const res = await fetch(`${API_BASE}/invoices/reminders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building: selectedBuildingId,
          daysAhead: 7
        })
      });
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || data.message || "Reminder send failed");
      }

      setReminderResult(data);
      fetchPaymentAlerts();
    } catch (error) {
      setPaymentAlertError(error.message);
    } finally {
      setReminderLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const duePayments = [
    ...paymentAlerts.overdue.map((item) => ({
      ...item,
      alertType: "overdue",
      amountDue: item.totalAmount || item.amount,
      timingLabel: `${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"} overdue`
    })),
    ...paymentAlerts.dueSoon.map((item) => ({
      ...item,
      alertType: item.daysUntilDue === 0 ? "today" : "soon",
      amountDue: item.amount,
      timingLabel: item.daysUntilDue === 0
        ? "Due today"
        : `${item.daysUntilDue} day${item.daysUntilDue === 1 ? "" : "s"} left`
    }))
  ].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const renderTenantPaymentDue = () => (
    <section className="panel dashboard-due-panel dashboard-priority-panel">
      <div className="section-header">
        <div>
          <h2>Tenant Payment Due</h2>
          <p>{duePayments.length} tenant payment{duePayments.length === 1 ? "" : "s"} need attention</p>
        </div>
        <button className="secondary-btn" onClick={() => navigate("/invoice")}>
          Open Invoices
        </button>
      </div>

      <div className="dashboard-reminder-actions">
        <button onClick={sendRemindersNow} disabled={reminderLoading || !selectedBuildingId}>
          <PaperAirplaneIcon />
          Send Reminders Now
        </button>
      </div>

      {paymentAlertError && <p className="error">{paymentAlertError}</p>}
      {paymentAlertsLoading && <p className="message">Loading due payments...</p>}
      {reminderResult && (
        <p className={reminderResult.failed > 0 ? "error" : "message"}>
          Reminder send checked {reminderResult.checked || 0},
          sent {reminderResult.sent || 0}, skipped {reminderResult.skipped || 0},
          failed {reminderResult.failed || 0}.
        </p>
      )}

      {duePayments.length > 0 ? (
        <div className="dashboard-due-list">
          {duePayments.map((item) => (
            <article
              key={`${item.alertType}-${item.invoiceId}`}
              className={`dashboard-due-item ${item.alertType === "overdue" ? "is-overdue" : ""}`}
            >
              <div className="dashboard-due-main">
                <div className="dashboard-due-icon">
                  {item.alertType === "overdue" ? <BellAlertIcon /> : <CalendarDaysIcon />}
                </div>
                <div>
                  <div className="dashboard-due-topline">
                    <h3>{item.tenantName || "Tenant"}</h3>
                    <span className={`status-pill ${item.alertType === "overdue" ? "status-overdue" : "status-pending"}`}>
                      {item.timingLabel}
                    </span>
                  </div>
                  <p>
                    Invoice {item.invoiceNumber}
                    {item.tenantUnit && ` / Unit ${item.tenantUnit}`}
                  </p>
                </div>
              </div>

              <div className="dashboard-due-meta">
                <span>
                  <CurrencyDollarIcon />
                  {formatCurrency(item.amountDue)}
                </span>
                <span>
                  <CalendarDaysIcon />
                  {formatEthiopianDate(item.dueDate)}
                </span>
                {item.tenantPhone && (
                  <span>
                    <PhoneIcon />
                    {item.tenantPhone}
                  </span>
                )}
                {item.tenantEmail && (
                  <span>
                    <EnvelopeIcon />
                    {item.tenantEmail}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !paymentAlertsLoading && <p className="empty-state">No due tenant payments for this building.</p>
      )}
    </section>
  );

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Dashboard</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building to see dashboard data.</p>
        )}
        {error && <p className="error">{error}</p>}

        {renderTenantPaymentDue()}

        <div className="dashboard-container">
          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <BuildingOfficeIcon className="card-icon" />
            Total Units <br /> {dashboard?.totalUnits || 0}
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <KeyIcon className="card-icon" />
            Occupied Units <br /> {dashboard?.totalUnitsOccupied || 0}
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <BuildingOfficeIcon className="card-icon" />
            Available Units <br /> {dashboard?.totalUnitsAvailable || 0}
          </div>

          <div className="card" onClick={() => navigate("/tenants")} style={{ cursor: "pointer" }}>
            <KeyIcon className="card-icon" />
            Total Tenants <br /> {dashboard?.totalTenants || 0}
          </div>

          <div className="card" onClick={() => navigate("/employees")} style={{ cursor: "pointer" }}>
            <UserGroupIcon className="card-icon" />
            Total Employees <br /> {dashboard?.totalEmployees || 0}
          </div>
        </div>

        <h1 style={{ marginTop: 100 }}>Financial Summary</h1>

        <div className="revenue-container">
          <div className="card">
            <CurrencyDollarIcon className="card-icon" />
            Monthly Rent Revenue: {formatCurrency(dashboard?.totalRevenue)}
          </div>

          <div className="card">
            <CurrencyDollarIcon className="card-icon" />
            Utility Revenue: {formatCurrency(dashboard?.utilityRevenue)}
          </div>

          <div className="card">
            <ArrowPathIcon className="card-icon" />
            Rent Due: {dashboard?.pendingPayments || 0}
          </div>

          <div className="card" onClick={() => navigate("/utilities")} style={{ cursor: "pointer" }}>
            <ArrowPathIcon className="card-icon" />
            Utilities Due: {dashboard?.pendingUtilityPayments || 0}
          </div>

          <div className="card">
            <ScaleIcon className="card-icon" />
            Occupancy: {dashboard?.occupancyRate || 0}%
          </div>

          <div className="card" onClick={() => navigate("/invoice")} style={{ cursor: "pointer" }}>
            <CurrencyDollarIcon className="card-icon" />
            Outstanding Rent: {formatCurrency(dashboard?.outstandingRent)}
          </div>

          <div className="card" onClick={() => navigate("/invoice")} style={{ cursor: "pointer" }}>
            <BellAlertIcon className="card-icon" />
            Overdue Invoices: {dashboard?.overdueInvoices || 0}
          </div>

          <div className="card">
            <CurrencyDollarIcon className="card-icon" />
            Collected This Month: {formatCurrency(dashboard?.monthlyCollected)}
          </div>
        </div>

        <section className="panel dashboard-activity-panel">
          <div className="section-header">
            <div>
              <h2>Recent Activity</h2>
              <p>{dashboard?.recentActivity?.length || 0} latest system action{dashboard?.recentActivity?.length === 1 ? "" : "s"}</p>
            </div>
            <button className="secondary-btn" onClick={() => navigate("/activity")}>
              Open Activity
            </button>
          </div>

          {dashboard?.recentActivity?.length > 0 ? (
            <div className="activity-list compact-list">
              {dashboard.recentActivity.map((item) => (
                <div key={item._id} className="activity-row">
                  <strong>{item.entityLabel || item.entityType}</strong>
                  <span>{item.message || item.action}</span>
                  <small>{formatEthiopianDate(item.createdAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No recent activity yet.</p>
          )}
        </section>

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
