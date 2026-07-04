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
  apiFetch,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import { confirmAction } from "../components/confirmAction";
import { clearAuthToken, clearCurrentUser } from "../authSession";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import useShortError from "../hooks/useShortError";
import { formatEthiopianDate } from "../utils/dateUtils";
import Sidebar from "./Sidebar";
import "../style.css";

const formatCurrency = (amount) => `Br ${Number(amount || 0).toLocaleString()}`;
const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

// Dashboard gives the manager the highest-priority building summary first:
// overdue/due rent, occupancy, revenue, and fast reminder actions.

export default function Dashboard() {
  const navigate = useNavigate();
  const selectedBuildingId = useSelectedBuilding();
  const [dashboard, setDashboard] = useState({});
  const [error, setError] = useShortError();
  const [paymentAlerts, setPaymentAlerts] = useState({ dueSoon: [], overdue: [] });
  const [utilityAlerts, setUtilityAlerts] = useState({ dueSoon: [], overdue: [] });
  const [activeDueList, setActiveDueList] = useState("rent");
  const [paymentAlertError, setPaymentAlertError] = useShortError();
  const [paymentAlertsLoading, setPaymentAlertsLoading] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [forceReminderSend, setForceReminderSend] = useState(false);
  const [utilityReminderLoading, setUtilityReminderLoading] = useState(false);
  const [utilityReminderResult, setUtilityReminderResult] = useState(null);
  const [forceUtilityReminderSend, setForceUtilityReminderSend] = useState(false);

  const fetchDashboard = useCallback(async () => {
    // Main dashboard cards come from one backend summary endpoint.
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
  }, [selectedBuildingId, setError]);

  const fetchPaymentAlerts = useCallback(async () => {
    // Due-soon and overdue invoices are fetched separately so the UI can label them clearly.
    if (!selectedBuildingId) {
      setPaymentAlerts({ dueSoon: [], overdue: [] });
      setUtilityAlerts({ dueSoon: [], overdue: [] });
      setPaymentAlertError("");
      return;
    }

    setPaymentAlertsLoading(true);
    setPaymentAlertError("");

    try {
      const [dueRes, overdueRes, utilityRes] = await Promise.all([
        apiFetch(withBuilding("/invoices/reminders", selectedBuildingId)),
        apiFetch(withBuilding("/invoices/overdue", selectedBuildingId)),
        apiFetch(withBuilding("/utilities/alerts", selectedBuildingId))
      ]);
      const [dueData, overdueData, utilityData] = await Promise.all([
        readResponse(dueRes),
        readResponse(overdueRes),
        readResponse(utilityRes)
      ]);

      if (!dueRes.ok) {
        throw new Error(dueData.error || "Failed to load due payments");
      }

      if (!overdueRes.ok) {
        throw new Error(overdueData.error || "Failed to load overdue payments");
      }

      if (!utilityRes.ok) {
        throw new Error(utilityData.error || "Failed to load utility payments");
      }

      setPaymentAlerts({
        dueSoon: Array.isArray(dueData) ? dueData : [],
        overdue: Array.isArray(overdueData) ? overdueData : []
      });
      setUtilityAlerts({
        dueSoon: Array.isArray(utilityData?.dueSoon) ? utilityData.dueSoon : [],
        overdue: Array.isArray(utilityData?.overdue) ? utilityData.overdue : []
      });
    } catch (error) {
      setPaymentAlertError(error.message);
    } finally {
      setPaymentAlertsLoading(false);
    }
  }, [selectedBuildingId, setPaymentAlertError]);

  useEffect(() => {
    fetchDashboard();
    fetchPaymentAlerts();
  }, [fetchDashboard, fetchPaymentAlerts]);

  const sendRemindersNow = async () => {
    // Manual reminder sends use the same backend service as the automatic reminder job.
    if (!selectedBuildingId) {
      setReminderResult(null);
      setPaymentAlertError("Select a building before sending reminders.");
      return;
    }

    setReminderLoading(true);
    setReminderResult(null);
    setPaymentAlertError("");

    try {
      if (forceReminderSend) {
        // Force resend bypasses "already sent" protection, so ask for confirmation.
        const shouldForceSend = await confirmAction({
          title: "Resend reminders?",
          message: "This will send reminders again even when the same reminder was already sent.",
          confirmText: "Send again",
          cancelText: "Cancel"
        });

        if (!shouldForceSend) {
          setReminderLoading(false);
          return;
        }
      }

      const res = await apiFetch(`${API_BASE}/invoices/reminders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building: selectedBuildingId,
          daysAhead: 7,
          force: forceReminderSend
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

  const sendUtilityRemindersNow = async () => {
    if (!selectedBuildingId) {
      setUtilityReminderResult(null);
      setPaymentAlertError("Select a building before sending utility reminders.");
      return;
    }

    setUtilityReminderLoading(true);
    setUtilityReminderResult(null);
    setPaymentAlertError("");

    try {
      if (forceUtilityReminderSend) {
        const shouldForceSend = await confirmAction({
          title: "Resend utility reminders?",
          message: "This will send utility reminders again even when the same reminder was already sent.",
          confirmText: "Send again",
          cancelText: "Cancel"
        });

        if (!shouldForceSend) {
          setUtilityReminderLoading(false);
          return;
        }
      }

      const res = await apiFetch(`${API_BASE}/utilities/reminders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building: selectedBuildingId,
          daysAhead: 7,
          force: forceUtilityReminderSend
        })
      });
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || data.message || "Utility reminder send failed");
      }

      setUtilityReminderResult(data);
      fetchPaymentAlerts();
    } catch (error) {
      setPaymentAlertError(error.message);
    } finally {
      setUtilityReminderLoading(false);
    }
  };

  const logout = async () => {
    // Logout clears the browser token and asks the backend to clear the direct-URL session cookie.
    await apiFetch(`${API_BASE}/logout`, { method: "POST" }).catch(() => {});
    clearAuthToken();
    clearCurrentUser();
    window.location.href = "/login";
  };

  // Merge overdue and due-soon invoices into one priority list sorted by due date.
  const duePayments = [
    ...paymentAlerts.overdue.map((item) => ({
      ...item,
      alertType: "overdue",
      amountDue: item.totalAmount || item.amount,
      baseAmount: item.amount,
      latePenalty: Number(item.latePenalty || 0),
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

  const dueSummary = {
    overdue: paymentAlerts.overdue.length,
    dueSoon: paymentAlerts.dueSoon.length,
    total: duePayments.reduce((sum, item) => sum + Number(item.amountDue || 0), 0)
  };
  const utilityDuePayments = [
    ...utilityAlerts.overdue.map((item) => ({
      ...item,
      alertType: "overdue",
      amountDue: item.amount,
      timingLabel: `${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"} overdue`
    })),
    ...utilityAlerts.dueSoon.map((item) => ({
      ...item,
      alertType: item.daysUntilDue === 0 ? "today" : "soon",
      amountDue: item.amount,
      timingLabel: item.daysUntilDue === 0
        ? "Due today"
        : `${item.daysUntilDue} day${item.daysUntilDue === 1 ? "" : "s"} left`
    }))
  ].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const utilityDueSummary = {
    overdue: utilityAlerts.overdue.length,
    dueSoon: utilityAlerts.dueSoon.length,
    total: utilityDuePayments.reduce((sum, item) => sum + Number(item.amountDue || 0), 0)
  };
  const activeDuePayments = activeDueList === "utility" ? utilityDuePayments : duePayments;
  const activeDueSummary = activeDueList === "utility" ? utilityDueSummary : dueSummary;
  const activeDueLabel = activeDueList === "utility" ? "utility bill" : "tenant payment";
  const monthlyRevenue = firstDefined(dashboard?.monthlyRevenue, dashboard?.normalizedMonthlyRevenue);
  const monthlyRentCollected = firstDefined(
    dashboard?.monthlyRentCollected,
    dashboard?.monthlyCollected,
    dashboard?.totalRevenue
  );
  const utilityRevenue = firstDefined(
    dashboard?.utilityRevenue,
    dashboard?.normalizedUtilityRevenue
  );
  const monthlyUtilityCollected = firstDefined(
    dashboard?.monthlyUtilityCollected,
    dashboard?.utilityCollectedThisMonth,
    dashboard?.utilityCollected
  );

  const renderTenantPaymentDue = () => (
    <section className="panel dashboard-due-panel dashboard-priority-panel">
      <div className="section-header">
        <div>
          <h2>Tenant Payment Due</h2>
          <p>{activeDuePayments.length} {activeDueLabel}{activeDuePayments.length === 1 ? "" : "s"} need attention</p>
        </div>
        <div className="dashboard-due-header-actions">
          <div className="dashboard-alert-tabs" role="tablist" aria-label="Payment due type">
            <button
              className={activeDueList === "rent" ? "active" : ""}
              onClick={() => setActiveDueList("rent")}
              type="button"
            >
              Rent
            </button>
            <button
              className={activeDueList === "utility" ? "active" : ""}
              onClick={() => setActiveDueList("utility")}
              type="button"
            >
              Utility
            </button>
          </div>
          <button
            className="secondary-btn"
            onClick={() => navigate(activeDueList === "utility" ? "/utilities" : "/invoice")}
          >
            {activeDueList === "utility" ? "Open Utilities" : "Open Invoices"}
          </button>
        </div>
      </div>

      <div className="dashboard-due-summary">
        <div className="dashboard-due-summary-item is-overdue">
          <BellAlertIcon />
          <span>Overdue</span>
          <strong>{activeDueSummary.overdue}</strong>
        </div>
        <div className="dashboard-due-summary-item">
          <CalendarDaysIcon />
          <span>Due Soon</span>
          <strong>{activeDueSummary.dueSoon}</strong>
        </div>
        <div className="dashboard-due-summary-item">
          <CurrencyDollarIcon />
          <span>Total Due</span>
          <strong>{formatCurrency(activeDueSummary.total)}</strong>
        </div>
      </div>

      {activeDueList === "rent" && (
        <div className="dashboard-reminder-actions">
          <button onClick={sendRemindersNow} disabled={reminderLoading || !selectedBuildingId}>
            <PaperAirplaneIcon />
            {reminderLoading ? "Sending..." : "Send Reminders Now"}
          </button>
          <label className="dashboard-force-toggle">
            <input
              type="checkbox"
              checked={forceReminderSend}
              onChange={(e) => setForceReminderSend(e.target.checked)}
              disabled={reminderLoading || !selectedBuildingId}
            />
            <span>Force resend</span>
          </label>
        </div>
      )}

      {activeDueList === "utility" && (
        <div className="dashboard-reminder-actions">
          <button onClick={sendUtilityRemindersNow} disabled={utilityReminderLoading || !selectedBuildingId}>
            <PaperAirplaneIcon />
            {utilityReminderLoading ? "Sending..." : "Send Utility Reminders Now"}
          </button>
          <label className="dashboard-force-toggle">
            <input
              type="checkbox"
              checked={forceUtilityReminderSend}
              onChange={(e) => setForceUtilityReminderSend(e.target.checked)}
              disabled={utilityReminderLoading || !selectedBuildingId}
            />
            <span>Force resend</span>
          </label>
        </div>
      )}

      {paymentAlertError && <p className="error">{paymentAlertError}</p>}
      {paymentAlertsLoading && <p className="message">Loading due payments...</p>}
      {activeDueList === "rent" && reminderResult && (
        <p className={reminderResult.failed > 0 ? "error" : "message"}>
          {reminderResult.force ? "Forced reminder run" : "Reminder send"} checked {reminderResult.checked || 0},
          sent {reminderResult.sent || 0}, skipped {reminderResult.skipped || 0},
          failed {reminderResult.failed || 0}.
        </p>
      )}
      {activeDueList === "utility" && utilityReminderResult && (
        <p className={utilityReminderResult.failed > 0 ? "error" : "message"}>
          {utilityReminderResult.force ? "Forced utility reminder run" : "Utility reminder send"} checked {utilityReminderResult.checked || 0},
          sent {utilityReminderResult.sent || 0}, skipped {utilityReminderResult.skipped || 0},
          failed {utilityReminderResult.failed || 0}.
        </p>
      )}

      {activeDuePayments.length > 0 ? (
        <div className="dashboard-due-list">
          {activeDuePayments.map((item, idx) => (
            <article
              key={`${activeDueList}-${item.alertType}-${item.invoiceId || item.utilityId || idx}`}
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
                    {activeDueList === "utility" ? "Utility bill" : `Invoice ${item.invoiceNumber}`}
                    {item.tenantUnit && ` / Unit ${item.tenantUnit}`}
                  </p>
                </div>
              </div>

              <div className="dashboard-due-meta">
                <span>
                  <CurrencyDollarIcon />
                  {formatCurrency(item.amountDue)}
                </span>
                {activeDueList === "rent" && item.alertType === "overdue" && Number(item.latePenalty || 0) > 0 && (
                  <span className="dashboard-penalty-meta">
                    <CurrencyDollarIcon />
                    + {formatCurrency(item.latePenalty)} ቅጣት
                  </span>
                )}
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
        !paymentAlertsLoading && (
          <p className="empty-state">
            {activeDueList === "utility"
              ? "No due utility payments for this building."
              : "No due tenant payments for this building."}
          </p>
        )
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
            <div>
              <div>Total Units</div>
              <strong>{dashboard?.totalUnits || 0}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <KeyIcon className="card-icon" />
            <div>
              <div>Occupied Units</div>
              <strong>{dashboard?.totalUnitsOccupied || 0}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <BuildingOfficeIcon className="card-icon" />
            <div>
              <div>Available Units</div>
              <strong>{dashboard?.totalUnitsAvailable || 0}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/tenants")} style={{ cursor: "pointer" }}>
            <UserGroupIcon className="card-icon" />
            <div>
              <div>Total Tenants</div>
              <strong>{dashboard?.totalTenants || 0}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/employees")} style={{ cursor: "pointer" }}>
            <UserGroupIcon className="card-icon" />
            <div>
              <div>Total Employees</div>
              <strong>{dashboard?.totalEmployees || 0}</strong>
            </div>
          </div>
        </div>

        <h1 style={{ marginTop: 60 }}>Financial Summary</h1>

        <div className="revenue-container">
          <div className="card" onClick={() => navigate("/invoice")} style={{ cursor: "pointer" }}>
            <CurrencyDollarIcon className="card-icon" />
            <div>
              <div>Rent Collected This Month</div>
              <strong>{formatCurrency(monthlyRentCollected)}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/invoice")} style={{ cursor: "pointer" }}>
            <CurrencyDollarIcon className="card-icon" />
            <div>
              <div>Outstanding Rent</div>
              <strong>{formatCurrency(dashboard?.outstandingRent)}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/utilities")} style={{ cursor: "pointer" }}>
            <CurrencyDollarIcon className="card-icon" />
            <div>
              <div>Utility Collected This Month</div>
              <strong>{formatCurrency(monthlyUtilityCollected)}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/utilities")} style={{ cursor: "pointer" }}>
            <CurrencyDollarIcon className="card-icon" />
            <div>
              <div>Utility Revenue</div>
              <strong>{formatCurrency(utilityRevenue)}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/contracts")} style={{ cursor: "pointer" }}>
            <CurrencyDollarIcon className="card-icon" />
            <div>
              <div>Monthly Revenue</div>
              <strong>{formatCurrency(monthlyRevenue)}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/invoice")} style={{ cursor: "pointer" }}>
            <ArrowPathIcon className="card-icon" />
            <div>
              <div>Rent Due</div>
              <strong>{dashboard?.pendingPayments || 0}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/utilities")} style={{ cursor: "pointer" }}>
            <ArrowPathIcon className="card-icon" />
            <div>
              <div>Utilities Due</div>
              <strong>{dashboard?.pendingUtilityPayments || 0}</strong>
            </div>
          </div>

          <div className="card" onClick={() => navigate("/units")} style={{ cursor: "pointer" }}>
            <ScaleIcon className="card-icon" />
            <div>
              <div>Occupancy Rate</div>
              <strong>{dashboard?.occupancyRate || 0}%</strong>
            </div>
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
              {dashboard.recentActivity.map((item, idx) => (
                <div key={item._id || idx} className="activity-row">
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
