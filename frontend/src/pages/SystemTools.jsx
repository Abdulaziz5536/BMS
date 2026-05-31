import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import Accounts from "./Accounts";
import {
  API_BASE,
  apiFetch,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import useShortError from "../hooks/useShortError";
import { formatEthiopianDate } from "../utils/dateUtils";
import { downloadFromUrl, downloadTextFile } from "../utils/downloadUtils";
import "../style.css";

const exportOptions = [
  { value: "tenants", label: "Tenants CSV" },
  { value: "invoices", label: "Invoices CSV" },
  { value: "contracts", label: "Contracts CSV" },
  { value: "payments", label: "Payments CSV" },
  { value: "employees", label: "Employees CSV" }
];

const qualityChecks = [
  "Global error boundary protects users from blank screens.",
  "Dashboard opens with tenant payment due first.",
  "Buttons, forms, panels, tabs, and tables share one polished visual system.",
  "Activity table has search and pagination inside System.",
  "Sidebar navigation is cleaner and adapts on tablet/mobile.",
  "Main operational tables use sortable headers.",
  "Documents and receipts support read-only preview/download.",
  "Status labels, alerts, and selected rows use clearer professional styling."
];

const testCoverage = [
  "Route loading smoke test for every backend route.",
  "CSV export escaping, date parsing, and system-check shape.",
  "Invoice period generation and contract date recalculation.",
  "Paid/pending invoice field transitions and contract-status invoice defaults.",
  "Frontend utility tests for dates, floor labels, sorting, and short errors.",
  "Frontend lint and production build checks."
];

const testCommands = [
  "npm.cmd test",
  "npm.cmd --prefix frontend run test",
  "npm.cmd --prefix frontend run lint",
  "npm.cmd run build"
];

const tabs = [
  { id: "checks", label: "Health" },
  { id: "quality", label: "Quality & Tests" },
  { id: "activity", label: "Activity" },
  { id: "exports", label: "Backup & Exports" },
  { id: "accounts", label: "Accounts" }
];

// SystemTools is the operator page for health checks, activity, backup, and exports.
// It avoids changing business data; it only reports status or downloads data.

const formatTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function SystemTools() {
  const selectedBuildingId = useSelectedBuilding();
  const getInitialTab = () => {
    const hashTab = window.location.hash.replace("#", "");
    return tabs.some((tab) => tab.id === hashTab) ? hashTab : "checks";
  };
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [checks, setChecks] = useState([]);
  const [checksOk, setChecksOk] = useState(false);
  const [checksSummary, setChecksSummary] = useState({
    total: 0,
    required: 0,
    requiredFailures: 0,
    optionalWarnings: 0
  });
  const [checkedAt, setCheckedAt] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityPage, setActivityPage] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useShortError();
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const activityPageSize = 8;

  const loadChecks = useCallback(async () => {
    // Health checks come from the backend so deployment/env problems are visible in the UI.
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch(`${API_BASE}/system/checks`);
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to load system checks");
      }

      setChecks(data.checks || []);
      setChecksOk(Boolean(data.ok));
      setChecksSummary(data.summary || {
        total: (data.checks || []).length,
        required: 0,
        requiredFailures: 0,
        optionalWarnings: 0
      });
      setCheckedAt(data.checkedAt || new Date().toISOString());
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  useEffect(() => {
    const syncTabFromHash = () => {
      const hashTab = window.location.hash.replace("#", "");
      if (tabs.some((tab) => tab.id === hashTab)) {
        setActiveTab(hashTab);
      }
    };

    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  const loadAuditLogs = useCallback(async () => {
    // Activity is scoped to the selected building and reset to page 1 after reload.
    if (!selectedBuildingId) {
      setAuditLogs([]);
      return;
    }

    setActivityLoading(true);

    try {
      const res = await apiFetch(withBuilding("/audit-logs?limit=300", selectedBuildingId));
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to load activity");
      }

      setAuditLogs(Array.isArray(data) ? data : []);
      setActivityPage(1);
    } catch (error) {
      setError(error.message);
    } finally {
      setActivityLoading(false);
    }
  }, [selectedBuildingId, setError]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const downloadBackup = async () => {
    // Backup downloads JSON for a full building snapshot.
    if (!selectedBuildingId) {
      setError("Select a building before downloading a backup.");
      return;
    }

    setMessage("");
    setError("");

    try {
      const res = await apiFetch(withBuilding("/system/backup", selectedBuildingId));
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || "Backup failed");
      }

      downloadTextFile(
        JSON.stringify(data, null, 2),
        `bms-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json"
      );
      const recordCount = data.counts
        ? Object.values(data.counts).reduce((sum, count) => sum + Number(count || 0), 0)
        : 0;
      setMessage(`Backup downloaded${recordCount ? ` with ${recordCount} records` : ""}.`);
    } catch (error) {
      setError(error.message);
    }
  };

  const downloadExport = async (resource) => {
    // CSV exports are smaller targeted downloads for spreadsheets/accounting.
    if (!selectedBuildingId) {
      setError("Select a building before exporting data.");
      return;
    }

    setMessage("");
    setError("");

    try {
      await downloadFromUrl(
        withBuilding(`/exports/${resource}`, selectedBuildingId),
        `${resource}-${new Date().toISOString().slice(0, 10)}.csv`
      );
      setMessage(`${resource} export downloaded.`);
    } catch (error) {
      setError(error.message);
    }
  };

  // Activity search is client-side because only the latest 300 records are loaded.
  const filteredAuditLogs = auditLogs.filter((log) => {
    const search = activitySearch.toLowerCase();
    return (
      log.action?.toLowerCase().includes(search) ||
      log.entityType?.toLowerCase().includes(search) ||
      log.entityLabel?.toLowerCase().includes(search) ||
      log.message?.toLowerCase().includes(search)
    );
  });
  const totalActivityPages = Math.max(1, Math.ceil(filteredAuditLogs.length / activityPageSize));
  const safeActivityPage = Math.min(activityPage, totalActivityPages);
  const paginatedAuditLogs = filteredAuditLogs.slice(
    (safeActivityPage - 1) * activityPageSize,
    safeActivityPage * activityPageSize
  );

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <div className="section-header">
          <div>
            <h1>System Tools</h1>
            <p>Deployment checks, exports, and JSON backup.</p>
          </div>
          <button className="secondary-btn compact-action-btn" onClick={loadChecks} disabled={loading}>
            <ArrowPathIcon />
            Recheck
          </button>
        </div>

        {!selectedBuildingId && (
          <p className="error">Select a building before downloading exports or backups.</p>
        )}
        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        <div className="system-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => {
                setActiveTab(tab.id);
                window.history.replaceState(null, "", `#${tab.id}`);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "checks" && (
          <section className="panel">
            <div className="section-header compact">
              <div>
                <h2>Deployment Checks</h2>
                <p>{checksOk ? "System checks are passing." : "Some checks need attention."}</p>
              </div>
            </div>

            <div className="system-health-summary">
              <div className={`system-health-card ${checksSummary.requiredFailures > 0 ? "warn" : "ok"}`}>
                <span>Required Issues</span>
                <strong>{checksSummary.requiredFailures}</strong>
              </div>
              <div className={checksSummary.optionalWarnings > 0 ? "system-health-card warn" : "system-health-card ok"}>
                <span>Optional Warnings</span>
                <strong>{checksSummary.optionalWarnings}</strong>
              </div>
              <div className="system-health-card">
                <span>Last Checked</span>
                <strong>{checkedAt ? `${formatEthiopianDate(checkedAt)} ${formatTime(checkedAt)}` : "-"}</strong>
              </div>
            </div>

            <div className="system-check-list">
              {checks.map((check) => (
                <div key={check.name} className={`system-check-row ${check.ok ? "ok" : "warn"}`}>
                  {check.ok ? <CheckCircleIcon /> : <ExclamationTriangleIcon />}
                  <div>
                    <strong>{check.name}</strong>
                    <span>{check.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "quality" && (
          <section className="panel">
            <div className="section-header compact">
              <div>
                <h2>Quality & Tests</h2>
                <p>Professional readiness checks for UI polish and automated coverage.</p>
              </div>
            </div>

            <div className="quality-grid">
              <div className="quality-card">
                <ClipboardDocumentCheckIcon />
                <h3>Automated Tests</h3>
                <ul>
                  {testCoverage.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="quality-card">
                <CheckCircleIcon />
                <h3>UI Polish</h3>
                <ul>
                  {qualityChecks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="command-list">
              {testCommands.map((command) => (
                <span key={command} className="code-pill">
                  <CommandLineIcon />
                  {command}
                </span>
              ))}
            </div>
          </section>
        )}

        {activeTab === "activity" && (
          <section className="panel">
            <div className="section-header compact">
              <div>
                <h2>System Activity</h2>
                <p>{filteredAuditLogs.length} activity record{filteredAuditLogs.length === 1 ? "" : "s"}</p>
              </div>
              <button className="secondary-btn compact-action-btn" onClick={loadAuditLogs} disabled={activityLoading || !selectedBuildingId}>
                <ArrowPathIcon />
                Refresh
              </button>
            </div>

            <div className="activity-toolbar">
              <label className="search-box">
                <MagnifyingGlassIcon />
                <input
                  type="text"
                  placeholder="Search activity..."
                  value={activitySearch}
                  onChange={(event) => {
                    setActivitySearch(event.target.value);
                    setActivityPage(1);
                  }}
                />
              </label>
            </div>

            {activityLoading && <p className="message">Loading activity...</p>}

            <div className="floors-table-wrapper">
              <table className="floors-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Type</th>
                    <th>Record</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAuditLogs.length > 0 ? (
                    paginatedAuditLogs.map((log) => (
                      <tr key={log._id}>
                        <td>{formatEthiopianDate(log.createdAt)}</td>
                        <td>{formatTime(log.createdAt)}</td>
                        <td>{log.action}</td>
                        <td>{log.entityType}</td>
                        <td>{log.entityLabel || log.entityId || "-"}</td>
                        <td>{log.message || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">No activity found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination-controls">
              <button
                className="secondary-btn compact-action-btn"
                onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
                disabled={safeActivityPage <= 1}
              >
                Previous
              </button>
              <span>Page {safeActivityPage} of {totalActivityPages}</span>
              <button
                className="secondary-btn compact-action-btn"
                onClick={() => setActivityPage((page) => Math.min(totalActivityPages, page + 1))}
                disabled={safeActivityPage >= totalActivityPages}
              >
                Next
              </button>
            </div>
          </section>
        )}

        {activeTab === "exports" && (
          <>
            <section className="panel">
              <h2>Backup</h2>
              <div className="backup-readiness-grid">
                <div>
                  <strong>JSON backup</strong>
                  <span>Includes selected building data, record counts, schema version, and current system-check snapshot.</span>
                </div>
                <div>
                  <strong>CSV exports</strong>
                  <span>Use focused files when finance, tenants, employees, or contracts need review outside the app.</span>
                </div>
              </div>
              <div className="form-actions">
                <button className="compact-action-btn" onClick={downloadBackup} disabled={!selectedBuildingId}>
                  <ArrowDownTrayIcon />
                  Download JSON Backup
                </button>
              </div>
            </section>

            <section className="panel">
              <h2>CSV Exports</h2>
              <div className="export-grid">
                {exportOptions.map((option) => (
                  <button
                    key={option.value}
                    className="secondary-btn compact-action-btn"
                    onClick={() => downloadExport(option.value)}
                    disabled={!selectedBuildingId}
                  >
                    <ArrowDownTrayIcon />
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "accounts" && <Accounts />}
      </div>
    </div>
  );
}
