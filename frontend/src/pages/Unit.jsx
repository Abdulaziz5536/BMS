import { useCallback, useState, useEffect, useRef } from "react";
import {
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

function Unit() {
  const selectedBuildingId = useSelectedBuilding();
  const [unitId, setUnitId] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [units, setUnits] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [floors, setFloors] = useState([]);
  const [floor, setFloor] = useState("");
  const [editingId, setEditingId] = useState(null);
  const unitFormRef = useRef(null);

  const clearForm = useCallback(() => {
    setUnitId("");
    setArea("");
    setType("");
    setFloor("");
    setEditingId(null);
  }, []);

  const fetchUnits = useCallback(async (useCache = true) => {
    if (!selectedBuildingId) {
      setUnits([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/units", selectedBuildingId),
      setUnits,
      setError,
      "Failed to load units",
      { useCache }
    );
  }, [selectedBuildingId]);

  const fetchFloors = useCallback(async (useCache = true) => {
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
  }, [selectedBuildingId]);

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    fetchUnits();
    fetchFloors();
  }, [clearForm, fetchFloors, fetchUnits, selectedBuildingId]);

  useEffect(() => {
    if (editingId) {
      unitFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const saveUnit = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!unitId || !area || !type || !floor) {
      setError("Please fill all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/units/${editingId}` : `${API_BASE}/units`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            unitId,
            area,
            type,
            floor
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Unit updated" : "Unit added"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchUnits(false);
      } else {
        setError(data.error || "Failed to save unit");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editUnit = (unit) => {
    setUnitId(unit.unitId || "");
    setArea(unit.area || "");
    setType(unit.type || "");
    setFloor(unit.floor?._id || "");
    setEditingId(unit._id);
    setMessage("");
    setError("");
  };

  const removeUnit = async (id) => {
    const shouldDelete = await confirmAction({
      title: "Delete unit?",
      message: "Are you sure you want to delete this unit?",
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/units/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Unit deleted");
        invalidateCache(selectedBuildingId);
        fetchUnits(false);
      } else {
        setError(data.error || "Failed to delete unit");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Units</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing units.</p>
        )}

        <section className="panel" ref={unitFormRef}>
          <h2>{editingId ? "Edit Unit" : "Add Unit"}</h2>

          <div className="form-grid">
            <input
              placeholder="Unit ID"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              placeholder="Area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              placeholder="Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <select
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              disabled={!selectedBuildingId}
            >
              <option value="">Select Floor</option>
              {floors.map((item) => (
                <option key={item._id} value={item._id}>
                  Floor {item.floor}
                </option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button onClick={saveUnit} disabled={!selectedBuildingId}>
              {editingId ? "Update Unit" : "Add Unit"}
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

        <h2>Units List</h2>

        <div className="floors-table-wrapper">
        <table className="floors-table">
          <thead>
            <tr>
              <th>Unit ID</th>
              <th>Area</th>
              <th>Type</th>
              <th>Floor</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {units.length > 0 ? (
              units.map((unit) => (
                <tr key={unit._id}>
                  <td>{unit.unitId}</td>
                  <td>{unit.area}</td>
                  <td>{unit.type}</td>
                  <td>{unit.floor?.floor || "-"}</td>
                  <td>
                    <span className={unit.status === "Occupied" ? "occupied-status" : "available-status"}>
                      {unit.status || "Available"}
                    </span>
                  </td>
                  <td>
                    <div className="table-action-stack">
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editUnit(unit)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => removeUnit(unit._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">No units added yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export default Unit;
