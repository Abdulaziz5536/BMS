import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { confirmAction } from "../components/confirmAction";
import {
  API_BASE,
  apiFetch,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import { formatFloorLabel } from "../utils/floorUtils";
import "../style.css";

// Heroicon Imports - Using only the ones that exist
import { 
  WrenchIcon,
  ClockIcon,
  CheckCircleIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  EyeIcon,
  TrashIcon,
  CameraIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function Maintenance() {
  const selectedBuildingId = useSelectedBuilding();
  const [requests, setRequests] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [floors, setFloors] = useState([]);

  // Form states
  const [requestId, setRequestId] = useState("");
  const [requestTarget, setRequestTarget] = useState("tenant");
  const [tenantId, setTenantId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("pending");
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [images, setImages] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");

  // Modal states
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [costDialogRequest, setCostDialogRequest] = useState(null);
  const [costDialogMode, setCostDialogMode] = useState("complete");
  const [costDialogValue, setCostDialogValue] = useState("");
  const [costDialogError, setCostDialogError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
  const MAX_IMAGES = 5;

  const readImageFile = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        reject(new Error("Image must be 5MB or smaller"));
        return;
      }

      if (!file.type.startsWith("image/")) {
        reject(new Error("File must be an image"));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type,
          data: reader.result,
          size: file.size
        });
      };
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
  };

  const formatDate = (date) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("en-GB");
  };

  const formatDateTime = (date) => {
    if (!date) return "-";
    const d = new Date(date);
    return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString()}`;
  };

  const getPriorityColor = (p) => {
    const colors = {
      urgent: "#DC2626",
      high: "#EA580C",
      medium: "#F59E0B",
      low: "#10B981"
    };
    return colors[p] || "#6B7280";
  };

  const getPriorityBgColor = (p) => {
    const colors = {
      urgent: "#FEE2E2",
      high: "#FFEDD5",
      medium: "#FEF3C7",
      low: "#DCFCE7"
    };
    return colors[p] || "#F3F4F6";
  };

  const getStatusColor = (s) => {
    const colors = {
      pending: "#F59E0B",
      approved: "#3B82F6",
      in_progress: "#8B5CF6",
      completed: "#10B981",
      cancelled: "#EF4444"
    };
    return colors[s] || "#6B7280";
  };

  const getStatusBgColor = (s) => {
    const colors = {
      pending: "#FEF3C7",
      approved: "#DBEAFE",
      in_progress: "#EDE9FE",
      completed: "#DCFCE7",
      cancelled: "#FEE2E2"
    };
    return colors[s] || "#F3F4F6";
  };

  const getStatusText = (s) => {
    const texts = {
      pending: "Pending",
      approved: "Approved",
      in_progress: "In Progress",
      completed: "Completed",
      cancelled: "Cancelled"
    };
    return texts[s] || s;
  };

  const getCategoryEmoji = (cat) => {
    const icons = {
      plumbing: "🚽",
      electric: "⚡",
      water: "💧",
      hvac: "❄️",
      appliance: "🔧",
      furniture: "🪑",
      pest: "🐜",
      security: "🔒",
      other: "📝"
    };
    return icons[cat] || "🔧";
  };

  const getRequestFloorLabel = (request) =>
    formatFloorLabel(request.floor?.floor ?? request.unit?.floor?.floor);

  const clearForm = () => {
    setRequestId("");
    setRequestTarget("tenant");
    setTenantId("");
    setUnitId("");
    setFloorId("");
    setCategory("plumbing");
    setPriority("medium");
    setTitle("");
    setDescription("");
    setStatus("pending");
    setAssignedTo("");
    setScheduledDate("");
    setEstimatedCost("");
    setActualCost("");
    setNotes("");
    setResolution("");
    setImages([]);
    setEditingId(null);
    setShowForm(false);
  };

  const fetchRequests = async (useCache = true) => {
    if (!selectedBuildingId) {
      setRequests([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/maintenance", selectedBuildingId),
      setRequests,
      setError,
      "Failed to load maintenance requests",
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

  const fetchFloors = async (useCache = true) => {
    if (!selectedBuildingId) {
      setFloors([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/floors", selectedBuildingId),
      setFloors,
      setError,
      "Failed to load floors",
      { useCache }
    );
  };

  const loadReferenceData = async (useCache = true) => {
    if (!selectedBuildingId) {
      return;
    }

    setReferenceDataLoading(true);

    try {
      await Promise.all([
        fetchTenants(useCache),
        fetchFloors(useCache)
      ]);
    } finally {
      setReferenceDataLoading(false);
    }
  };

  const fetchRequestDetails = async (id) => {
    const res = await apiFetch(withBuilding(`/maintenance/${id}`, selectedBuildingId));
    const data = await readResponse(res);

    if (!res.ok) {
      throw new Error(data.error || "Failed to load request details");
    }

    return data.maintenance || data;
  };

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    setTenants([]);
    setFloors([]);
    setSelectedRequest(null);
    setShowDetailsModal(false);
    setPreviewImage(null);
    setCostDialogRequest(null);
    setCostDialogMode("complete");
    setCostDialogValue("");
    setCostDialogError("");
    setActiveRequestId("");

    if (!selectedBuildingId) {
      setRequests([]);
      return;
    }

    loadCachedJson(
      withBuilding("/maintenance", selectedBuildingId),
      setRequests,
      setError,
      "Failed to load maintenance requests"
    );
  }, [selectedBuildingId]);

  const filteredRequests = requests
    .filter((req) => {
      const floorLabel = String(getRequestFloorLabel(req)).toLowerCase();
      const matchesSearch =
        req.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.tenant?.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        floorLabel.includes(searchTerm.toLowerCase()) ||
        req.requestId?.toString().includes(searchTerm);
      
      const matchesStatus = statusFilter === "all" || req.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || req.priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    })
    .sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === "tenant") {
        aValue = a.tenant?.tenantName || "";
        bValue = b.tenant?.tenantName || "";
      } else if (sortField === "unit") {
        aValue = a.unit?.unitId || "";
        bValue = b.unit?.unitId || "";
      } else if (sortField === "floor") {
        aValue = a.floor?.floor ?? a.unit?.floor?.floor ?? "";
        bValue = b.floor?.floor ?? b.unit?.floor?.floor ?? "";
      } else if (sortField === "priority") {
        aValue = priorityOrder[a.priority] || 999;
        bValue = priorityOrder[b.priority] || 999;
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

  const saveRequest = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    const hasLocation =
      requestTarget === "tenant" ? Boolean(tenantId) : Boolean(floorId);

    if (!hasLocation || !title || !description) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch(
        editingId ? withBuilding(`/maintenance/${editingId}`, selectedBuildingId) : `${API_BASE}/maintenance`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            requestId: requestId || `REQ-${Date.now()}`,
            tenant: requestTarget === "tenant" ? tenantId : "",
            unit: requestTarget === "tenant" ? unitId : "",
            floor: requestTarget === "floor" ? floorId : "",
            category,
            priority,
            title,
            description,
            status,
            assignedTo,
            scheduledDate,
            estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
            actualCost: actualCost ? Number(actualCost) : undefined,
            notes,
            resolution,
            images: images.length > 0 ? images : undefined
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Request updated" : "Request submitted"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchRequests(false);
      } else {
        setError(data.error || "Failed to save request");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus, extraPayload = {}) => {
    setLoading(true);
    setActiveRequestId(id);
    try {
      const res = await apiFetch(withBuilding(`/maintenance/${id}/status`, selectedBuildingId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...extraPayload })
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(`Request marked as ${getStatusText(newStatus)}`);
        if (selectedRequest?._id === id && data.maintenance) {
          setSelectedRequest(data.maintenance);
        }
        invalidateCache(selectedBuildingId);
        fetchRequests(false);
      } else {
        setError(data.error || "Failed to update status");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
      setActiveRequestId("");
    }
  };

  const updateActualCost = async (id, nextActualCost) => {
    setLoading(true);
    setActiveRequestId(id);

    try {
      const res = await apiFetch(withBuilding(`/maintenance/${id}/cost`, selectedBuildingId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualCost: nextActualCost })
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage("Actual cost updated");
        if (selectedRequest?._id === id && data.maintenance) {
          setSelectedRequest(data.maintenance);
        }
        invalidateCache(selectedBuildingId);
        fetchRequests(false);
      } else {
        setError(data.error || "Failed to update actual cost");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
      setActiveRequestId("");
    }
  };

  const openActualCostDialog = (req, mode = "complete") => {
    setCostDialogRequest(req);
    setCostDialogMode(mode);
    const currentActualCost =
      req.actualCost !== undefined && req.actualCost !== null ? String(req.actualCost) : "";
    const suggestedCompletionCost =
      Number(req.actualCost) > 0
        ? String(req.actualCost)
        : req.estimatedCost !== undefined && req.estimatedCost !== null
          ? String(req.estimatedCost)
          : "";

    setCostDialogValue(mode === "cost" ? currentActualCost : suggestedCompletionCost);
    setCostDialogError("");
  };

  const closeActualCostDialog = () => {
    setCostDialogRequest(null);
    setCostDialogValue("");
    setCostDialogError("");
  };

  const saveActualCostDialog = async () => {
    if (!costDialogRequest) return;

    const nextActualCost = Number(costDialogValue || 0);

    if (!Number.isFinite(nextActualCost) || nextActualCost < 0) {
      setCostDialogError("Actual cost must be a valid non-negative number");
      return;
    }

    closeActualCostDialog();

    if (costDialogMode === "complete") {
      await updateStatus(costDialogRequest._id, "completed", { actualCost: nextActualCost });
      return;
    }

    await updateActualCost(costDialogRequest._id, nextActualCost);
  };

  const deleteRequest = async (id) => {
    const shouldDelete = await confirmAction({
      title: "Delete maintenance request?",
      message: "Are you sure you want to delete this maintenance request?",
      confirmText: "Delete",
      cancelText: "Cancel"
    });

    if (!shouldDelete) return;

    setActiveRequestId(id);

    try {
      const res = await apiFetch(withBuilding(`/maintenance/${id}`, selectedBuildingId), {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage("Request deleted successfully");
        invalidateCache(selectedBuildingId);
        fetchRequests(false);
        if (selectedRequest?._id === id) {
          setSelectedRequest(null);
          setShowDetailsModal(false);
        }
      } else {
        setError(data.error || "Failed to delete request");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setActiveRequestId("");
    }
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (images.length + files.length > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    try {
      const newImages = await Promise.all(files.map(readImageFile));
      setImages([...images, ...newImages.filter(img => img !== null)]);
    } catch (error) {
      setError(error.message);
    }
    event.target.value = "";
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const getImageDownloadName = (img, index) => {
    const fallbackExtension = img.type?.split("/")[1] || "jpg";
    const fallbackName = `${selectedRequest?.requestId || requestId || "maintenance"}-photo-${index + 1}.${fallbackExtension}`;
    return String(img.name || fallbackName).replace(/[\\/:*?"<>|]/g, "-");
  };

  const downloadImage = (img, index = 0) => {
    if (!img?.data) {
      setError("Photo is not available for download");
      return;
    }

    const link = document.createElement("a");
    link.href = img.data;
    link.download = getImageDownloadName(img, index);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    inProgress: requests.filter(r => r.status === "in_progress").length,
    completed: requests.filter(r => r.status === "completed").length
  };

  const openNewRequestForm = async () => {
    setMessage("");
    setError("");
    setShowForm(true);
    await loadReferenceData();
  };

  const openRequestDetails = async (req) => {
    setMessage("");
    setError("");
    setActiveRequestId(req._id);

    try {
      const detail = await fetchRequestDetails(req._id);
      setSelectedRequest(detail);
      setShowDetailsModal(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setActiveRequestId("");
    }
  };

  const fillRequestForm = (req) => {
    setEditingId(req._id);
    setRequestId(req.requestId || "");
    setRequestTarget(req.floor && !req.tenant ? "floor" : "tenant");
    setTenantId(req.tenant?._id || "");
    setUnitId(req.unit?._id || "");
    setFloorId(req.floor?._id || "");
    setCategory(req.category || "plumbing");
    setPriority(req.priority || "medium");
    setTitle(req.title || "");
    setDescription(req.description || "");
    setStatus(req.status || "pending");
    setAssignedTo(req.assignedTo || "");
    setScheduledDate(req.scheduledDate || "");
    setEstimatedCost(req.estimatedCost || "");
    setActualCost(req.actualCost || "");
    setNotes(req.notes || "");
    setResolution(req.resolution || "");
    setImages(req.images || []);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const editRequest = async (req) => {
    setMessage("");
    setError("");
    setActiveRequestId(req._id);

    try {
      await loadReferenceData();
      const detail = await fetchRequestDetails(req._id);
      fillRequestForm(detail);
    } catch (error) {
      setError(error.message);
    } finally {
      setActiveRequestId("");
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <div className="page-header">
          <h1>Maintenance Requests</h1>
          <button
            className="primary-btn"
            onClick={openNewRequestForm}
            disabled={!selectedBuildingId || referenceDataLoading}
          >
            <PlusIcon className="w-4 h-4" />
            {referenceDataLoading ? "Loading..." : "New Request"}
          </button>
        </div>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing maintenance requests.</p>
        )}

        {/* Stats Summary */}
        <div className="dashboard-container" style={{ marginBottom: "2rem" }}>
          <div className="card">
            <WrenchIcon className="card-icon" />
            <div>
              <div>Total Requests</div>
              <strong style={{ fontSize: "28px" }}>{stats.total}</strong>
            </div>
          </div>
          <div className="card" style={{ borderTop: `4px solid #F59E0B` }}>
            <ClockIcon className="card-icon" style={{ color: "#F59E0B" }} />
            <div>
              <div>Pending</div>
              <strong style={{ fontSize: "28px", color: "#F59E0B" }}>{stats.pending}</strong>
            </div>
          </div>
          <div className="card" style={{ borderTop: `4px solid #8B5CF6` }}>
            <WrenchIcon className="card-icon" style={{ color: "#8B5CF6" }} />
            <div>
              <div>In Progress</div>
              <strong style={{ fontSize: "28px", color: "#8B5CF6" }}>{stats.inProgress}</strong>
            </div>
          </div>
          <div className="card" style={{ borderTop: `4px solid #10B981` }}>
            <CheckCircleIcon className="card-icon" style={{ color: "#10B981" }} />
            <div>
              <div>Completed</div>
              <strong style={{ fontSize: "28px", color: "#10B981" }}>{stats.completed}</strong>
            </div>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <section className="panel">
            <h2>{editingId ? "Edit Request" : "New Maintenance Request"}</h2>

            <div className="form-grid">
              <select
                value={requestTarget}
                onChange={(e) => {
                  setRequestTarget(e.target.value);
                  setTenantId("");
                  setUnitId("");
                  setFloorId("");
                }}
                disabled={!selectedBuildingId || referenceDataLoading}
              >
                <option value="tenant">Tenant / Unit</option>
                <option value="floor">Floor / Common Area</option>
              </select>

              {requestTarget === "tenant" ? (
                <select
                  value={tenantId}
                  onChange={(e) => {
                    setTenantId(e.target.value);
                    const tenant = tenants.find(t => t._id === e.target.value);
                    setUnitId(tenant?.unit?._id || tenant?.unit || "");
                  }}
                  disabled={!selectedBuildingId || referenceDataLoading}
                >
                  <option value="">Select Tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant._id} value={tenant._id}>
                      {tenant.tenantName} - Unit {tenant.unit?.unitId || "Unassigned"}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                  disabled={!selectedBuildingId || referenceDataLoading}
                >
                  <option value="">Select Floor</option>
                  {floors.map((floor) => (
                    <option key={floor._id} value={floor._id}>
                      Floor {formatFloorLabel(floor.floor)}
                    </option>
                  ))}
                </select>
              )}

              <input
                placeholder="Request Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!selectedBuildingId}
              />

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!selectedBuildingId}
              >
                <option value="plumbing">🚽 Plumbing</option>
                <option value="electric">⚡ Electrical</option>
                <option value="water">💧 Water</option>
                <option value="hvac">❄️ HVAC</option>
                <option value="appliance">🔧 Appliance</option>
                <option value="furniture">🪑 Furniture</option>
                <option value="pest">🐜 Pest Control</option>
                <option value="security">🔒 Security</option>
                <option value="other">📝 Other</option>
              </select>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!selectedBuildingId}
              >
                <option value="urgent">🔴 Urgent (24hr)</option>
                <option value="high">🟠 High (3 days)</option>
                <option value="medium">🟡 Medium (1 week)</option>
                <option value="low">🟢 Low (2 weeks)</option>
              </select>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!selectedBuildingId || !editingId}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                disabled={!selectedBuildingId}
                placeholder="Scheduled Date"
              />

              <input
                type="number"
                placeholder="Expected Cost (Br)"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                disabled={!selectedBuildingId}
              />

              <input
                type="number"
                placeholder="Actual Cost (Br)"
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
                disabled={!selectedBuildingId}
              />
            </div>

            <textarea
              placeholder="Description of the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              style={{ width: "100%", marginTop: "1rem", padding: "0.75rem" }}
              disabled={!selectedBuildingId}
            />

            {editingId && (
              <>
                <textarea
                  placeholder="Resolution notes..."
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows="3"
                  style={{ width: "100%", marginTop: "1rem", padding: "0.75rem" }}
                />
              </>
            )}

            {/* Image Upload */}
            <div className="image-upload-section" style={{ marginTop: "1rem" }}>
              <label className="field-label file-field">
                <CameraIcon className="upload-camera-icon" />
                Upload Photos (Max {MAX_IMAGES})
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  disabled={!selectedBuildingId || images.length >= MAX_IMAGES}
                />
              </label>
              {images.length > 0 && (
                <div className="image-preview">
                  {images.map((img, idx) => (
                    <div key={idx} className="image-preview-item">
                      <img src={img.data} alt={`Preview ${idx}`} />
                      <button type="button" onClick={() => removeImage(idx)}>✖</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button onClick={saveRequest} disabled={!selectedBuildingId || loading || referenceDataLoading}>
                {loading ? "Saving..." : editingId ? "Update Request" : "Submit Request"}
              </button>
              <button className="secondary-btn" onClick={clearForm}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        {/* Filters */}
        <div className="table-controls">
          <div className="search-box">
            <MagnifyingGlassIcon className="w-4 h-4" />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Requests Table */}
        <div className="floors-table-wrapper">
          <table className="floors-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("requestId")} className="sortable-header">ID</th>
                <th onClick={() => handleSort("title")} className="sortable-header">Title</th>
                <th onClick={() => handleSort("tenant")} className="sortable-header">Tenant</th>
                <th onClick={() => handleSort("unit")} className="sortable-header">Unit</th>
                <th onClick={() => handleSort("floor")} className="sortable-header">Floor</th>
                <th onClick={() => handleSort("category")} className="sortable-header">Category</th>
                <th onClick={() => handleSort("priority")} className="sortable-header">Priority</th>
                <th onClick={() => handleSort("status")} className="sortable-header">Status</th>
                <th onClick={() => handleSort("createdAt")} className="sortable-header">Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length > 0 ? (
                filteredRequests.map((req) => (
                  <tr key={req._id}>
                    <td>{req.requestId}</td>
                    <td>{req.title}</td>
                    <td>{req.tenant?.tenantName || "-"}</td>
                    <td>{req.unit?.unitId || "-"}</td>
                    <td>{getRequestFloorLabel(req)}</td>
                    <td>{getCategoryEmoji(req.category)} {req.category}</td>
                    <td>
                      <span 
                        className="priority-badge"
                        style={{ 
                          background: getPriorityBgColor(req.priority),
                          color: getPriorityColor(req.priority),
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "700",
                          display: "inline-block"
                        }}
                      >
                        {req.priority}
                      </span>
                    </td>
                    <td>
                      <span 
                        className="status-badge"
                        style={{ 
                          background: getStatusBgColor(req.status),
                          color: getStatusColor(req.status),
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "700",
                          display: "inline-block"
                        }}
                      >
                        {getStatusText(req.status)}
                      </span>
                    </td>
                    <td>{formatDate(req.createdAt)}</td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="icon-btn" 
                          onClick={() => openRequestDetails(req)}
                          disabled={activeRequestId === req._id}
                          title="View Details"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <button 
                          className="icon-btn" 
                          onClick={() => editRequest(req)}
                          disabled={activeRequestId === req._id}
                          title="Edit Request"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        {req.status === "pending" && (
                          <button 
                            className="icon-btn" 
                            onClick={() => updateStatus(req._id, "in_progress")}
                            disabled={activeRequestId === req._id}
                            title="Start Work"
                          >
                            <WrenchIcon className="w-4 h-4" />
                          </button>
                        )}
                        {req.status === "in_progress" && (
                          <button 
                            className="icon-btn success" 
                            onClick={() => openActualCostDialog(req, "complete")}
                            disabled={activeRequestId === req._id}
                            title="Mark Complete"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          className="icon-btn danger" 
                          onClick={() => deleteRequest(req._id)}
                          disabled={activeRequestId === req._id}
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="empty-state">No maintenance requests found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Details Modal */}
        {showDetailsModal && selectedRequest && (
          <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Request #{selectedRequest.requestId}</h2>
                <button className="modal-close" onClick={() => setShowDetailsModal(false)}>✖</button>
              </div>
              <div className="modal-body">
                <div className="detail-grid">
                  <div><strong>Title:</strong> {selectedRequest.title}</div>
                  <div><strong>Tenant:</strong> {selectedRequest.tenant?.tenantName || "-"}</div>
                  <div><strong>Unit:</strong> {selectedRequest.unit?.unitId || "-"}</div>
                  <div><strong>Floor:</strong> {getRequestFloorLabel(selectedRequest)}</div>
                  <div><strong>Category:</strong> {getCategoryEmoji(selectedRequest.category)} {selectedRequest.category}</div>
                  <div><strong>Priority:</strong> <span style={{ color: getPriorityColor(selectedRequest.priority), fontWeight: "bold" }}>{selectedRequest.priority}</span></div>
                  <div><strong>Status:</strong> <span style={{ color: getStatusColor(selectedRequest.status) }}>{getStatusText(selectedRequest.status)}</span></div>
                  <div><strong>Submitted:</strong> {formatDateTime(selectedRequest.createdAt)}</div>
                  <div><strong>Scheduled:</strong> {formatDate(selectedRequest.scheduledDate)}</div>
                  <div><strong>Expected Cost:</strong> Br {selectedRequest.estimatedCost || 0}</div>
                  <div><strong>Actual Cost:</strong> Br {selectedRequest.actualCost || 0}</div>
                </div>
                <div className="detail-section">
                  <strong>Description:</strong>
                  <p>{selectedRequest.description}</p>
                </div>
                {selectedRequest.resolution && (
                  <div className="detail-section">
                    <strong>Resolution:</strong>
                    <p>{selectedRequest.resolution}</p>
                  </div>
                )}
                {selectedRequest.images && selectedRequest.images.length > 0 && (
                  <div className="detail-section">
                    <strong>Photos:</strong>
                    <div className="maintenance-photo-grid">
                      {selectedRequest.images.map((img, idx) => (
                        <div key={idx} className="maintenance-photo-card">
                          <img src={img.data} alt={`Request ${idx + 1}`} />
                          <div>
                            <span>{img.name || `Photo ${idx + 1}`}</span>
                            <button
                              type="button"
                              className="secondary-btn compact-action-btn"
                              onClick={() => setPreviewImage(img)}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className="secondary-btn compact-action-btn"
                              onClick={() => downloadImage(img, idx)}
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer maintenance-details-actions">
                {selectedRequest.status === "pending" && (
                  <button
                    onClick={() => updateStatus(selectedRequest._id, "in_progress")}
                    disabled={activeRequestId === selectedRequest._id}
                  >
                    <WrenchIcon className="w-4 h-4" />
                    Start Work
                  </button>
                )}
                {selectedRequest.status === "in_progress" && (
                  <button
                    onClick={() => openActualCostDialog(selectedRequest, "complete")}
                    disabled={activeRequestId === selectedRequest._id}
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Mark Complete
                  </button>
                )}
                <button
                  className="secondary-btn"
                  onClick={() => openActualCostDialog(selectedRequest, "cost")}
                  disabled={activeRequestId === selectedRequest._id}
                >
                  Edit Actual Cost
                </button>
                <button className="secondary-btn" onClick={() => setShowDetailsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {previewImage && (
          <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
            <div className="modal-content maintenance-image-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{previewImage.name || "Photo preview"}</h2>
                <button className="modal-close" onClick={() => setPreviewImage(null)}>✖</button>
              </div>
              <div className="modal-body maintenance-image-preview-body">
                <img src={previewImage.data} alt={previewImage.name || "Maintenance photo"} />
              </div>
              <div className="modal-footer">
                <button className="secondary-btn" onClick={() => downloadImage(previewImage)}>
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Download
                </button>
                <button className="secondary-btn" onClick={() => setPreviewImage(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {costDialogRequest && (
          <div className="modal-overlay" onClick={closeActualCostDialog}>
            <div className="modal-content actual-cost-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{costDialogMode === "complete" ? "Complete Request" : "Edit Actual Cost"}</h2>
                <button className="modal-close" onClick={closeActualCostDialog}>✖</button>
              </div>
              <div className="modal-body">
                <div className="detail-grid">
                  <div><strong>Request:</strong> {costDialogRequest.title}</div>
                  <div><strong>Expected Cost:</strong> Br {costDialogRequest.estimatedCost || 0}</div>
                </div>
                <label className="field-label actual-cost-field">
                  Actual Cost (Br)
                  <input
                    type="number"
                    min="0"
                    value={costDialogValue}
                    onChange={(e) => setCostDialogValue(e.target.value)}
                    placeholder="Enter actual cost"
                  />
                </label>
                {costDialogError && <p className="error">{costDialogError}</p>}
              </div>
              <div className="modal-footer">
                <button className="secondary-btn" onClick={closeActualCostDialog}>Cancel</button>
                <button onClick={saveActualCostDialog} disabled={loading}>
                  {costDialogMode === "complete" ? "Save and Complete" : "Save Cost"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
