import { useCallback, useEffect, useState } from "react";
import {
  EyeIcon,
  KeyIcon,
  UserPlusIcon
} from "@heroicons/react/24/outline";
import { API_BASE, apiFetch, readResponse } from "../buildingSelection";
import useShortError from "../hooks/useShortError";
import { portLabel } from "../utils/portLabels";
import "../style.css";

export default function Accounts() {
  const [viewers, setViewers] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useShortError();
  const [loading, setLoading] = useState(false);

  const fetchViewers = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/users/viewers`);
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to load accounts");
      }

      setViewers(Array.isArray(data) ? data : []);
    } catch (error) {
      setError(error.message);
    }
  }, [setError]);

  useEffect(() => {
    fetchViewers();
  }, [fetchViewers]);

  const saveReadOnlyAccount = async () => {
    setMessage("");
    setError("");

    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (!/^\d{6}$/.test(password)) {
      setError("Password must be exactly 6 digits");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/users/viewers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to save account");
      }

      setMessage(data.message || "Read-only account saved");
      setName("");
      setEmail("");
      setPassword("");
      fetchViewers();
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="accounts-page">
      <div className="page-header">
        <div>
          <h1>{portLabel("Accounts", "መለያዎች")}</h1>
          <p className="accounts-subtitle">{portLabel("Read-only logins", "ማየት ብቻ")}</p>
        </div>
      </div>

      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}

      <section className="panel accounts-panel">
        <div className="section-header">
          <div>
            <h2>{portLabel("Create Father Login", "የአባት መግቢያ")}</h2>
            <p>{portLabel("Payment status only", "የክፍያ ሁኔታ ብቻ")}</p>
          </div>
          <UserPlusIcon className="accounts-panel-icon" />
        </div>

        <div className="form-grid">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={portLabel("Name", "ስም")}
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={portLabel("Email", "ኢሜይል")}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={portLabel("6-digit password", "6 ቁጥር")}
          />
        </div>

        <div className="form-actions">
          <button onClick={saveReadOnlyAccount} disabled={loading}>
            <KeyIcon />
            {loading ? "Saving..." : "Save Read-Only Login"}
          </button>
        </div>
      </section>

      <section className="panel accounts-panel">
        <div className="section-header">
          <div>
            <h2>{portLabel("Read-Only Accounts", "ማየት ብቻ")}</h2>
            <p>{viewers.length} account{viewers.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="accounts-list">
          {viewers.length > 0 ? (
            viewers.map((viewer) => (
              <article key={viewer._id || viewer.id} className="account-row">
                <EyeIcon />
                <div>
                  <strong>{viewer.name || "Read-only user"}</strong>
                  <span>{viewer.email}</span>
                </div>
                <em>{portLabel("Read only", "ማየት ብቻ")}</em>
              </article>
            ))
          ) : (
            <p className="empty-state">No read-only accounts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
