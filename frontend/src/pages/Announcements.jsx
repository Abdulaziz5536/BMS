import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  PaperAirplaneIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon
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
import { formatEthiopianDateTime } from "../utils/dateUtils";
import "../style.css";

const initialFormData = {
  title: "",
  message: "",
  type: "announcement",
  targetType: "all_tenants",
  selectedFloors: [],
  selectedUnits: [],
  tenantIds: [],
  scheduledFor: ""
};

const notificationOptions = [
  { value: "email", label: "Email", Icon: EnvelopeIcon },
  { value: "sms", label: "SMS", Icon: DevicePhoneMobileIcon },
  { value: "both", label: "Both", Icon: MegaphoneIcon }
];

const typeLabels = {
  announcement: "Announcement",
  emergency: "Emergency Alert",
  rent_reminder: "Rent Reminder"
};

const targetLabels = {
  all_tenants: "All Tenants",
  selected_floors: "Selected Floors",
  selected_units: "Selected Units",
  specific_tenants: "Specific Tenants"
};

const statusLabels = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed"
};

const getTenantUnitId = (tenant) => {
  if (!tenant?.unit) return "";
  return typeof tenant.unit === "object" ? tenant.unit._id : tenant.unit;
};

const buildDeliveryText = (delivery) => {
  if (!delivery) return "";

  const parts = [];

  if (delivery.email) {
    parts.push(`Email ${delivery.email.sent} sent, ${delivery.email.failed} failed`);
  }

  if (delivery.sms) {
    parts.push(`SMS ${delivery.sms.sent} sent, ${delivery.sms.failed} failed`);
  }

  return parts.join(". ");
};

export default function Announcements() {
  const selectedBuildingId = useSelectedBuilding();
  const [announcements, setAnnouncements] = useState([]);
  const [floors, setFloors] = useState([]);
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [notificationMethod, setNotificationMethod] = useState("email");
  const [loadingAction, setLoadingAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const stats = useMemo(() => ({
    total: announcements.length,
    draft: announcements.filter((item) => item.status === "draft").length,
    sent: announcements.filter((item) => item.status === "sent").length,
    failed: announcements.filter((item) => item.status === "failed").length
  }), [announcements]);

  const selectedTargetCount = useMemo(() => {
    if (formData.targetType === "selected_floors") return formData.selectedFloors.length;
    if (formData.targetType === "selected_units") return formData.selectedUnits.length;
    if (formData.targetType === "specific_tenants") return formData.tenantIds.length;
    return tenants.length;
  }, [formData, tenants.length]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setNotificationMethod("email");
  }, []);

  const fetchAnnouncements = useCallback(async (useCache = true) => {
    if (!selectedBuildingId) {
      setAnnouncements([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/announcements", selectedBuildingId),
      setAnnouncements,
      setError,
      "Failed to load announcements",
      { useCache }
    );
  }, [selectedBuildingId]);

  const fetchBuildingData = useCallback(async (useCache = true) => {
    if (!selectedBuildingId) {
      setFloors([]);
      setUnits([]);
      setTenants([]);
      setAnnouncements([]);
      return;
    }

    await Promise.all([
      loadCachedJson(
        withBuilding("/floors", selectedBuildingId),
        setFloors,
        setError,
        "Failed to load floors",
        { useCache }
      ),
      loadCachedJson(
        withBuilding("/units", selectedBuildingId),
        setUnits,
        setError,
        "Failed to load units",
        { useCache }
      ),
      loadCachedJson(
        withBuilding("/tenants", selectedBuildingId),
        setTenants,
        setError,
        "Failed to load tenants",
        { useCache }
      ),
      fetchAnnouncements(useCache)
    ]);
  }, [fetchAnnouncements, selectedBuildingId]);

  useEffect(() => {
    setMessage("");
    setError("");
    resetForm();
    fetchBuildingData();
  }, [fetchBuildingData, resetForm, selectedBuildingId]);

  const updateFormData = (event) => {
    const { name, value } = event.target;

    setFormData((current) => {
      const next = { ...current, [name]: value };

      if (name === "targetType") {
        next.selectedFloors = [];
        next.selectedUnits = [];
        next.tenantIds = [];
      }

      return next;
    });
  };

  const toggleSelection = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value]
    }));
  };

  const buildPayload = () => {
    const payload = {
      title: formData.title.trim(),
      message: formData.message.trim(),
      type: formData.type,
      targetType: formData.targetType,
      building: selectedBuildingId,
      scheduledFor: formData.scheduledFor || undefined,
      sendEmail: notificationMethod === "email" || notificationMethod === "both",
      sendSMS: notificationMethod === "sms" || notificationMethod === "both"
    };

    if (formData.targetType === "selected_floors") {
      payload.targetIds = formData.selectedFloors;
      payload.targetModel = "Floor";
    }

    if (formData.targetType === "selected_units") {
      payload.targetIds = formData.selectedUnits;
      payload.targetModel = "Unit";
    }

    if (formData.targetType === "specific_tenants") {
      payload.tenantIds = formData.tenantIds;
    }

    return payload;
  };

  const validateForm = () => {
    if (!selectedBuildingId) return "Add or select a building first";
    if (!formData.title.trim()) return "Title is required";
    if (!formData.message.trim()) return "Message is required";
    if (formData.targetType === "selected_floors" && formData.selectedFloors.length === 0) {
      return "Select at least one floor";
    }
    if (formData.targetType === "selected_units" && formData.selectedUnits.length === 0) {
      return "Select at least one unit";
    }
    if (formData.targetType === "specific_tenants" && formData.tenantIds.length === 0) {
      return "Select at least one tenant";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoadingAction("create");

      const response = await fetch(`${API_BASE}/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildPayload())
      });
      const result = await readResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "Failed to create announcement");
      }

      resetForm();
      setShowForm(false);
      setMessage(result.message || "Announcement created successfully");
      invalidateCache(selectedBuildingId);
      fetchAnnouncements(false);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingAction("");
    }
  };

  const handleSend = async (id) => {
    setMessage("");
    setError("");

    try {
      setLoadingAction(`send-${id}`);

      const response = await fetch(`${API_BASE}/announcements/${id}/send`, {
        method: "POST"
      });
      const result = await readResponse(response);

      if (!response.ok) {
        const emailErrors = result.errors?.email || [];
        const smsErrors = result.errors?.sms || [];
        const detail = [...emailErrors, ...smsErrors]
          .map((item) => `${item.email || item.phone || item.tenant}: ${item.error}`)
          .join("; ");

        throw new Error(detail || result.error || "Failed to send announcement");
      }

      const deliveryText = buildDeliveryText(result.delivery);
      setMessage(deliveryText ? `${result.message}. ${deliveryText}.` : result.message);
      fetchAnnouncements(false);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingAction("");
    }
  };

  const handleDelete = async (id) => {
    const shouldDelete = await confirmAction({
      title: "Delete announcement?",
      message: "Are you sure you want to delete this announcement?",
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    setMessage("");
    setError("");

    try {
      setLoadingAction(`delete-${id}`);

      const response = await fetch(`${API_BASE}/announcements/${id}`, {
        method: "DELETE"
      });
      const result = await readResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete announcement");
      }

      setMessage(result.message || "Announcement deleted successfully");
      invalidateCache(selectedBuildingId);
      fetchAnnouncements(false);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingAction("");
    }
  };

  const renderNotificationMethod = (announcement) => {
    const methods = [];
    if (announcement.sendEmail) methods.push("Email");
    if (announcement.sendSMS) methods.push("SMS");
    return methods.length ? methods.join(" + ") : "None";
  };

  const renderTargetSelector = () => {
    if (formData.targetType === "selected_floors") {
      return (
        <div className="announcement-picker">
          {floors.length === 0 ? (
            <p className="empty-state compact">No floors found for this building.</p>
          ) : (
            floors.map((floor) => {
              const selected = formData.selectedFloors.includes(floor._id);

              return (
                <label
                  key={floor._id}
                  className={`picker-row ${selected ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelection("selectedFloors", floor._id)}
                  />
                  <span>
                    <strong>Floor {floor.floor}</strong>
                    <small>{floor.units} units</small>
                  </span>
                </label>
              );
            })
          )}
        </div>
      );
    }

    if (formData.targetType === "selected_units") {
      return (
        <div className="announcement-picker">
          {units.length === 0 ? (
            <p className="empty-state compact">No units found for this building.</p>
          ) : (
            units.map((unit) => {
              const selected = formData.selectedUnits.includes(unit._id);
              const tenant = tenants.find((item) => getTenantUnitId(item) === unit._id);

              return (
                <label
                  key={unit._id}
                  className={`picker-row ${selected ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelection("selectedUnits", unit._id)}
                  />
                  <span>
                    <strong>Unit {unit.unitId || unit._id}</strong>
                    <small>{tenant ? tenant.tenantName : "No tenant assigned"}</small>
                  </span>
                </label>
              );
            })
          )}
        </div>
      );
    }

    if (formData.targetType === "specific_tenants") {
      return (
        <div className="announcement-picker">
          {tenants.length === 0 ? (
            <p className="empty-state compact">No tenants found for this building.</p>
          ) : (
            tenants.map((tenant) => {
              const selected = formData.tenantIds.includes(tenant._id);

              return (
                <label
                  key={tenant._id}
                  className={`picker-row ${selected ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelection("tenantIds", tenant._id)}
                  />
                  <span>
                    <strong>{tenant.tenantName}</strong>
                    <small>{tenant.email || "No email"} / {tenant.phone || "No phone"}</small>
                  </span>
                </label>
              );
            })
          )}
        </div>
      );
    }

    return null;
  };

  const renderDeliveryStatus = (announcement) => {
    const sms = announcement.deliveryStatus?.sms;
    const email = announcement.deliveryStatus?.email;
    const hasDelivery = (sms?.total || 0) > 0 || (email?.total || 0) > 0;

    if (!hasDelivery) {
      return null;
    }

    return (
      <div className="delivery-grid">
        {email?.total > 0 && (
          <div>
            <span>Email</span>
            <strong>{email.sent} sent</strong>
            {email.failed > 0 && <em>{email.failed} failed</em>}
          </div>
        )}

        {sms?.total > 0 && (
          <div>
            <span>SMS</span>
            <strong>{sms.sent} sent</strong>
            {sms.failed > 0 && <em>{sms.failed} failed</em>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content announcement-page">
        <div className="page-header">
          <h1>Announcements</h1>
          <button
            type="button"
            className="primary-btn icon-btn"
            onClick={() => setShowForm((value) => !value)}
            disabled={!selectedBuildingId}
          >
            {showForm ? <XMarkIcon /> : <PlusIcon />}
            {showForm ? "Cancel" : "New Announcement"}
          </button>
        </div>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before creating announcements.</p>
        )}

        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        <div className="announcement-stats">
          <div>
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div>
            <span>Draft</span>
            <strong>{stats.draft}</strong>
          </div>
          <div>
            <span>Sent</span>
            <strong>{stats.sent}</strong>
          </div>
          <div>
            <span>Failed</span>
            <strong>{stats.failed}</strong>
          </div>
        </div>

        {showForm && (
          <section className="panel announcement-form-panel">
            <h2>Create Announcement</h2>

            <form onSubmit={handleSubmit}>
              <div className="announcement-form-grid">
                <label className="field-label">
                  Title
                  <input
                    name="title"
                    value={formData.title}
                    onChange={updateFormData}
                    placeholder="Maintenance notice"
                    disabled={!selectedBuildingId}
                  />
                </label>

                <label className="field-label">
                  Type
                  <select
                    name="type"
                    value={formData.type}
                    onChange={updateFormData}
                    disabled={!selectedBuildingId}
                  >
                    <option value="announcement">Announcement</option>
                    <option value="emergency">Emergency Alert</option>
                    <option value="rent_reminder">Rent Reminder</option>
                  </select>
                </label>
              </div>

              <label className="field-label">
                Message
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={updateFormData}
                  rows={5}
                  placeholder="Write the message tenants will receive"
                  disabled={!selectedBuildingId}
                />
              </label>

              <div className="announcement-form-grid">
                <label className="field-label">
                  Audience
                  <select
                    name="targetType"
                    value={formData.targetType}
                    onChange={updateFormData}
                    disabled={!selectedBuildingId}
                  >
                    <option value="all_tenants">All Tenants</option>
                    <option value="selected_floors">Selected Floors</option>
                    <option value="selected_units">Selected Units</option>
                    <option value="specific_tenants">Specific Tenants</option>
                  </select>
                </label>

                <label className="field-label">
                  Scheduled Date
                  <input
                    type="datetime-local"
                    name="scheduledFor"
                    value={formData.scheduledFor}
                    onChange={updateFormData}
                    disabled={!selectedBuildingId}
                  />
                </label>
              </div>

              {renderTargetSelector()}

              <div className="announcement-method-row">
                <span>Delivery</span>
                <div className="segmented-control">
                  {notificationOptions.map(({ value, label, Icon }) => {
                    const MethodIcon = Icon;

                    return (
                      <button
                        key={value}
                        type="button"
                        className={notificationMethod === value ? "active" : ""}
                        onClick={() => setNotificationMethod(value)}
                        disabled={!selectedBuildingId}
                      >
                        <MethodIcon />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <strong>{selectedTargetCount} recipient target{selectedTargetCount === 1 ? "" : "s"}</strong>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-btn icon-btn"
                  disabled={!selectedBuildingId || loadingAction === "create"}
                >
                  <PlusIcon />
                  {loadingAction === "create" ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={resetForm}
                  disabled={loadingAction === "create"}
                >
                  Reset
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="panel announcement-list-panel">
          <div className="section-header">
            <h2>Recent Announcements</h2>
            <span>{announcements.length} total</span>
          </div>

          {announcements.length === 0 ? (
            <p className="empty-state">No announcements yet.</p>
          ) : (
            <div className="announcement-list">
              {announcements.map((announcement) => {
                const canSend = ["draft", "scheduled", "failed"].includes(announcement.status);

                return (
                  <article
                    key={announcement._id}
                    className={`announcement-card type-${announcement.type}`}
                  >
                    <div className="announcement-card-header">
                      <div>
                        <h3>{announcement.title}</h3>
                        <div className="announcement-meta">
                          <span>{typeLabels[announcement.type] || announcement.type}</span>
                          <span>{targetLabels[announcement.targetType] || announcement.targetType}</span>
                          <span>{renderNotificationMethod(announcement)}</span>
                          {announcement.building?.name && <span>{announcement.building.name}</span>}
                        </div>
                      </div>

                      <span className={`status-badge status-${announcement.status}`}>
                        {statusLabels[announcement.status] || announcement.status}
                      </span>
                    </div>

                    <p className="announcement-message-preview">{announcement.message}</p>

                    <div className="announcement-time-row">
                      <span>Created {formatEthiopianDateTime(announcement.createdAt)}</span>
                      {announcement.sentAt && <span>Sent {formatEthiopianDateTime(announcement.sentAt)}</span>}
                      {announcement.scheduledFor && <span>Scheduled {formatEthiopianDateTime(announcement.scheduledFor)}</span>}
                    </div>

                    {renderDeliveryStatus(announcement)}

                    <div className="announcement-actions">
                      {canSend && (
                        <button
                          type="button"
                          className="primary-btn icon-btn"
                          onClick={() => handleSend(announcement._id)}
                          disabled={Boolean(loadingAction)}
                        >
                          <PaperAirplaneIcon />
                          {loadingAction === `send-${announcement._id}` ? "Sending..." : "Send Now"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="danger-btn icon-btn"
                        onClick={() => handleDelete(announcement._id)}
                        disabled={Boolean(loadingAction)}
                      >
                        <TrashIcon />
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
