import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";

function Unit() {
  const [unitId, setUnitId] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [units, setUnits] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [floors, setFloors] = useState([]);
  const [floor, setFloor] = useState("");
  const [editingId, setEditingId] = useState(null);

  const fetchUnits = async () => {
    try {
      const res = await fetch("http://localhost:3000/units");
      const data = await res.json();
      setUnits(data);
    } catch (error) {
      setError(error.message);
    }
  };

  const fetchFloors = async () => {
    try {
      const res = await fetch("http://localhost:3000/floors");
      const data = await res.json();
      setFloors(data);
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    fetchUnits();
    fetchFloors();
  }, []);

  const clearForm = () => {
    setUnitId("");
    setArea("");
    setType("");
    setFloor("");
    setEditingId(null);
  };

  const saveUnit = async () => {
    setMessage("");
    setError("");

    if (!unitId || !area || !type || !floor) {
      setError("Please fill all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId
          ? `http://localhost:3000/units/${editingId}`
          : "http://localhost:3000/units",
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ unitId, area, type, floor })
        }
      );

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || (editingId ? "Unit updated" : "Unit added"));
        clearForm();
        fetchUnits();
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
    try {
      setMessage("");
      setError("");

      const res = await fetch(`http://localhost:3000/units/${id}`, {
        method: "DELETE"
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || "Unit deleted");
        fetchUnits();
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

        <section className="panel">
          <h2>{editingId ? "Edit Unit" : "Add Unit"}</h2>

          <div className="form-grid">
            <input
              placeholder="Unit ID"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            />

            <input
              placeholder="Area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />

            <input
              placeholder="Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />

            <select value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value="">Select Floor</option>
              {floors.map((item) => (
                <option key={item._id} value={item._id}>
                  Floor {item.floor}
                </option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button onClick={saveUnit}>
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

        <table className="floors-table">
          <thead>
            <tr>
              <th>Unit ID</th>
              <th>Area</th>
              <th>Type</th>
              <th>Floor</th>
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
                  <td>{unit.floor?.floor}</td>
                  <td>
                    <button onClick={() => editUnit(unit)}>
                      Edit
                    </button>
                    <button className="danger-btn" onClick={() => removeUnit(unit._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">No units added yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Unit;
