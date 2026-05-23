import { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ClockIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import {
  loadCachedJson,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import { formatEthiopianDate } from "../utils/dateUtils";
import "../style.css";

const formatTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function Activity() {
  const selectedBuildingId = useSelectedBuilding();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (useCache = true) => {
    setLoading(true);
    await loadCachedJson(
      withBuilding("/audit-logs?limit=200", selectedBuildingId),
      setLogs,
      setError,
      "Failed to load activity",
      { useCache }
    );
    setLoading(false);
  }, [selectedBuildingId]);

  useEffect(() => {
    if (!selectedBuildingId) {
      setLogs([]);
      return;
    }

    fetchLogs();
  }, [fetchLogs, selectedBuildingId]);

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <div className="section-header">
          <div>
            <h1>Activity Log</h1>
            <p>Recent system changes and reminder/payment actions.</p>
          </div>
          <button className="secondary-btn compact-action-btn" onClick={() => fetchLogs(false)} disabled={loading || !selectedBuildingId}>
            <ArrowPathIcon />
            Refresh
          </button>
        </div>

        {!selectedBuildingId && (
          <p className="error">Add or select a building to see activity.</p>
        )}
        {error && <p className="error">{error}</p>}
        {loading && <p className="message">Loading activity...</p>}

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
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log._id}>
                    <td>{formatEthiopianDate(log.createdAt)}</td>
                    <td>
                      <span className="icon-text">
                        <ClockIcon />
                        {formatTime(log.createdAt)}
                      </span>
                    </td>
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
      </div>
    </div>
  );
}
