import { useEffect, useRef, useState } from "react";
import {
  PencilSquareIcon,
  TrashIcon,
  CheckIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import { confirmAction } from "../components/confirmAction";
import {
  API_BASE,
  getSelectedBuildingId,
  invalidateCache,
  loadCachedJson,
  notifyBuildingsUpdated,
  readResponse,
  setSelectedBuildingId
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import { compareSortValues, nextSortDirection } from "../utils/sortUtils";
import "../style.css";

export default function Buildings() {
  const selectedBuildingId = useSelectedBuilding();
  const [buildings, setBuildings] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [managerName, setManagerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState(null);
  const buildingFormRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  const loadBuildings = async () => {
    await loadCachedJson(
      `${API_BASE}/buildings`,
      (data) => {
        setBuildings(data);

        if (!getSelectedBuildingId() && data.length > 0) {
          setSelectedBuildingId(data[0]._id);
        }
      },
      setError,
      "Failed to load buildings"
    );
  };

  useEffect(() => {
    loadBuildings();
  }, []);

  useEffect(() => {
    if (editingId) {
      buildingFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const clearForm = () => {
    setName("");
    setAddress("");
    setManagerName("");
    setPhone("");
    setNotes("");
    setEditingId(null);
  };

  const saveBuilding = async () => {
    setMessage("");
    setError("");

    if (!name) {
      setError("Building name is required");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/buildings/${editingId}` : `${API_BASE}/buildings`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name, address, managerName, phone, notes })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Building updated" : "Building added"));
        clearForm();
        invalidateCache("/buildings");

        if (data.building?._id) {
          setSelectedBuildingId(data.building._id);
        }

        notifyBuildingsUpdated();
        loadBuildings();
      } else {
        setError(data.error || "Failed to save building");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editBuilding = (building) => {
    setName(building.name || "");
    setAddress(building.address || "");
    setManagerName(building.managerName || "");
    setPhone(building.phone || "");
    setNotes(building.notes || "");
    setEditingId(building._id);
    setMessage("");
    setError("");
  };

  const deleteBuilding = async (buildingId) => {
    const shouldDelete = await confirmAction({
      title: "Delete building?",
      message: "Delete this building and all of its floors, units, tenants, contracts, employees, and utilities?",
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/buildings/${buildingId}`, {
        method: "DELETE"
      });
      const data = await readResponse(res);

      if (res.ok) {
        const remainingBuildings = buildings.filter((building) => building._id !== buildingId);
        invalidateCache();

        if (selectedBuildingId === buildingId) {
          setSelectedBuildingId(remainingBuildings[0]?._id || "");
        }

        setMessage(data.message || "Building deleted");
        clearForm();
        notifyBuildingsUpdated();
        loadBuildings();
      } else {
        setError(data.error || "Failed to delete building");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const sortedBuildings = [...buildings].sort((a, b) =>
    compareSortValues(a[sortField], b[sortField], sortDirection)
  );

  const handleSort = (field) => {
    setSortDirection(nextSortDirection(sortField, field, sortDirection));
    setSortField(field);
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Buildings</h1>

        <section className="panel" ref={buildingFormRef}>
          <h2>{editingId ? "Edit Building" : "Add Building"}</h2>

          <div className="form-grid">
            <input
              placeholder="Building Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              placeholder="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            <input
              placeholder="Manager Name"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />

            <input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <input
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button onClick={saveBuilding}>
              {editingId ? "Update Building" : "Add Building"}
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

        <h2>Buildings List</h2>

        <div className="floors-table-wrapper">
        <table className="floors-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("name")} className="sortable-header">
                Name {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("address")} className="sortable-header">
                Address {sortField === "address" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("managerName")} className="sortable-header">
                Manager {sortField === "managerName" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("phone")} className="sortable-header">
                Phone {sortField === "phone" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedBuildings.length > 0 ? (
              sortedBuildings.map((building) => (
                <tr
                  key={building._id}
                  className={selectedBuildingId === building._id ? "selected-row" : ""}
                >
                  <td>{building.name}</td>
                  <td>{building.address || "-"}</td>
                  <td>{building.managerName || "-"}</td>
                  <td>{building.phone || "-"}</td>
                  <td>{selectedBuildingId === building._id ? "Selected" : "-"}</td>
                  <td>
                    <div className="table-action-stack">
                      <button className="table-action-btn" onClick={() => setSelectedBuildingId(building._id)} title="Select">
                        <CheckIcon />
                      </button>
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editBuilding(building)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => deleteBuilding(building._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">No buildings added yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
