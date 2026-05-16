import { useEffect, useState } from "react";
import {
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import {
  API_BASE,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import "../style.css";

export default function Floors() {
  const selectedBuildingId = useSelectedBuilding();
  const [floor, setFloor] = useState("");
  const [units, setUnits] = useState("");
  const [sqm, setSqm] = useState("");
  const [floors, setFloors] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  const clearForm = () => {
    setFloor("");
    setUnits("");
    setSqm("");
    setEditingId(null);
  };

  const loadFloors = async (useCache = true) => {
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

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    loadFloors();
  }, [selectedBuildingId]);

  const saveFloor = async () => {
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

    try {
      const bodyData = {
        building: selectedBuildingId,
        floor: Number(floor),
        units: Number(units),
        totalSqm: Number(sqm)
      };

      const res = await fetch(
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
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/floors/${id}`, {
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

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Floors Management</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing floors.</p>
        )}

        <div className="floors-form">
          <input
            type="number"
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
              <th>Floor</th>
              <th>Units</th>
              <th>Total SQM</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {floors.length > 0 ? (
              floors.map((item) => (
                <tr key={item._id}>
                  <td>{item.floor}</td>
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
      </div>
    </div>
  );
}
