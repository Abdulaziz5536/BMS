import { useCallback, useEffect, useRef, useState } from "react";
import {
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
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
import useShortError from "../hooks/useShortError";
import { formatFloorLabel } from "../utils/floorUtils";
import { compareSortValues, nextSortDirection } from "../utils/sortUtils";
import "../style.css";

// Floors page manages building floors, including basement labels like B1..B4.

export default function Floors() {
  const selectedBuildingId = useSelectedBuilding();
  const [floor, setFloor] = useState("");
  const [units, setUnits] = useState("");
  const [sqm, setSqm] = useState("");
  const [floors, setFloors] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useShortError();
  const [editingId, setEditingId] = useState(null);
  const [sortField, setSortField] = useState("floor");
  const [sortDirection, setSortDirection] = useState("asc");
  const floorFormRef = useRef(null);

  const clearForm = useCallback(() => {
    setFloor("");
    setUnits("");
    setSqm("");
    setEditingId(null);
  }, []);

  const loadFloors = useCallback(async (useCache = true) => {
    // Floors are loaded per building because floor numbers can repeat in different buildings.
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
  }, [selectedBuildingId, setError]);

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    loadFloors();
  }, [clearForm, loadFloors, selectedBuildingId, setError]);

  useEffect(() => {
    if (editingId) {
      floorFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const saveFloor = async () => {
    // Validate numeric floor/unit/area values before the backend duplicate check.
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!floor || !units || !sqm) {
      setError("Please fill in all fields");
      return;
    }

    const floorNumber = Number(floor);
    const unitCount = Number(units);
    const totalArea = Number(sqm);

    if (!Number.isFinite(floorNumber) || !Number.isFinite(unitCount) || !Number.isFinite(totalArea)) {
      setError("Floor, units, and total SQM must be valid numbers");
      return;
    }

    if (!Number.isInteger(floorNumber)) {
      setError("Floor must be a whole number");
      return;
    }

    if (floorNumber < -4) {
      setError("Basement floor cannot be below B4");
      return;
    }

    if (!Number.isInteger(unitCount)) {
      setError("Units must be a whole number");
      return;
    }

    if (unitCount < 0 || totalArea < 0) {
      setError("Units and total SQM cannot be negative");
      return;
    }

    try {
      const bodyData = {
        building: selectedBuildingId,
        floor: floorNumber,
        units: unitCount,
        totalSqm: totalArea
      };

      const res = await apiFetch(
        editingId ? `${API_BASE}/floors/${editingId}` : `${API_BASE}/floors`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyData)
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(
          data.message || (editingId ? "Floor updated successfully" : "Floor added successfully")
        );
        clearForm();
        invalidateCache(selectedBuildingId);
        loadFloors(false);
      } else {
        setError(data.error || "Failed to save floor");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editFloor = (item) => {
    setFloor(item.floor);
    setUnits(item.units);
    setSqm(item.totalSqm);
    setEditingId(item._id);
    setMessage("");
    setError("");
  };

  const deleteFloor = async (id) => {
    // Backend blocks deletion when units are assigned to the floor.
    const shouldDelete = await confirmAction({
      title: "Delete floor?",
      message: "Are you sure you want to delete this floor?",
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const res = await apiFetch(`${API_BASE}/floors/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Floor deleted successfully");
        invalidateCache(selectedBuildingId);
        loadFloors(false);
      } else {
        setError(data.error || "Failed to delete floor");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const sortedFloors = [...floors].sort((a, b) =>
    compareSortValues(a[sortField], b[sortField], sortDirection)
  );

  const handleSort = (field) => {
    setSortDirection(nextSortDirection(sortField, field, sortDirection));
    setSortField(field);
  };

  return (
    <>
        <h1>Floors Management</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing floors.</p>
        )}

        <div className="floors-form" ref={floorFormRef}>
          <input
            type="number"
            min="-4"
            step="1"
            placeholder="Floor Number"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            disabled={!selectedBuildingId}
          />

          <input
            type="number"
            placeholder="Units"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            disabled={!selectedBuildingId}
          />

          <input
            type="number"
            placeholder="Total SQM"
            value={sqm}
            onChange={(e) => setSqm(e.target.value)}
            disabled={!selectedBuildingId}
          />

          <button onClick={saveFloor} disabled={!selectedBuildingId}>
            {editingId ? "Update Floor" : "Add Floor"}
          </button>

          {editingId && (
            <button onClick={clearForm}>
              Cancel
            </button>
          )}
        </div>

        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        <h2>Floors List</h2>

        <div className="floors-table-wrapper">
        <table className="floors-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("floor")} className="sortable-header">
                Floor {sortField === "floor" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("units")} className="sortable-header">
                Units {sortField === "units" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("totalSqm")} className="sortable-header">
                Total SQM {sortField === "totalSqm" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedFloors.length > 0 ? (
              sortedFloors.map((item) => (
                <tr key={item._id}>
                  <td>{formatFloorLabel(item.floor)}</td>
                  <td>{item.units}</td>
                  <td>{item.totalSqm}</td>
                  <td>
                    <div className="table-action-stack">
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editFloor(item)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => deleteFloor(item._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">No floors added yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
    </>
  );
}
