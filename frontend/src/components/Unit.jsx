import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";

function Unit() {
  const [unitId, setUnitId] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [units, setUnits] = useState([]);
  const [message, setMessage] = useState("");
  const [floors, setFloors] = useState([]);
  const [floor, setFloor] = useState("");
  const [editingId, setEditingId] = useState(null);

  const fetchUnits = async () => {
    const res = await fetch("http://localhost:3000/units");
    const data = await res.json();
    setUnits(data);
  };

  const fetchFloors = async () => {
    const res = await fetch("http://localhost:3000/floors");
    const data = await res.json();
    setFloors(data);
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
    if (!unitId || !area || !type || !floor) {
      setMessage("Please fill all fields");
      return;
    }

    let res;

    if (editingId) {
      res = await fetch(`http://localhost:3000/units/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ unitId, area, type, floor })
      });
    } else {
      res = await fetch("http://localhost:3000/units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ unitId, area, type, floor })
      });
    }

    const data = await res.json();

    if (res.ok) {
      setMessage(data.message);
      clearForm();
      fetchUnits();
    } else {
      setMessage(data.error);
    }
  };

  const editUnit = (u) => {
    setUnitId(u.unitId);
    setArea(u.area);
    setType(u.type);
    setFloor(u.floor?._id || "");
    setEditingId(u._id);
    setMessage("");
  };

  const removeUnit = async (id) => {
    await fetch(`http://localhost:3000/units/${id}`, {
      method: "DELETE"
    });

    fetchUnits();
  };

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />

      <div style={{ padding: "20px" }}>
        <h1>Units</h1>

        <input
          placeholder="unitId"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
        />

        <input
          placeholder="area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />

        <input
          placeholder="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />

        <select value={floor} onChange={(e) => setFloor(e.target.value)}>
          <option value="">Select Floor</option>

          {floors.map((f) => (
            <option key={f._id} value={f._id}>
              {f.floor}
            </option>
          ))}
        </select>

        <button onClick={saveUnit}>
          {editingId ? "Update Unit" : "Add Unit"}
        </button>

        {editingId && (
          <button onClick={clearForm} style={{ marginLeft: "10px" }}>
            Cancel
          </button>
        )}

        <p>{message}</p>
        <hr />

        <h2>List Units</h2>

        {units.map((u) => (
          <div key={u._id}>
            <p>Unit ID: {u.unitId}</p>
            <p>Area: {u.area}</p>
            <p>Type: {u.type}</p>
            <p>Floor: {u.floor?.floor}</p>

            <button onClick={() => editUnit(u)}>Edit</button>
            <button onClick={() => removeUnit(u._id)}>Remove</button>

            <hr />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Unit;