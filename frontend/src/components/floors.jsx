import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import "../style.css";

export default function Floors() {
  const [floor, setFloor] = useState("");
  const [units, setUnits] = useState("");
  const [sqm, setSqm] = useState("");
  const [floors, setFloors] = useState([]);
  const [message, setMessage] = useState("");

  const API = "http://localhost:3000/floors";

  const loadFloors = async () => {
  try {
    const res = await fetch(API);
    const data = await res.json();

    if (res.ok) {
      setFloors(data);
      setMessage("");
    } else {
      setMessage(data.error );
    }
  } catch (error) {
    console.log("loadFloors fetch error:", error);
    setMessage(error.message );
  }
};

const addFloor = async () => {
  setMessage("");

  if (!floor || !units || !sqm) {
    setMessage("Please fill in all fields");
    return;
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        floor: Number(floor),
        units: Number(units),
        totalSqm: Number(sqm)
      })
    });

    const text = await res.text();
    console.log("POST /floors raw response:", text);

    const data = text ? JSON.parse(text) : {};

    if (res.ok) {
      setMessage(data.message );
      setFloor("");
      setUnits("");
      setSqm("");
      loadFloors();
    } else {
      setMessage(data.error );
    }
  } catch (error) {
    console.log("addFloor fetch error:", error);
    setMessage(error.message );
  }
};
 
  const editFloor = async (item) => {
    const newFloor = prompt("Floor", item.floor);
    const newUnits = prompt("Units", item.units);
    const newSqm = prompt("Total SQM", item.totalSqm);

    if (!newFloor || !newUnits || !newSqm) return;

    try {
      const res = await fetch(`${API}/${item._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          floor: Number(newFloor),
          units: Number(newUnits),
          totalSqm: Number(newSqm)
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Floor updated successfully");
        loadFloors();
      } else {
        setMessage(data.error );
      }
    } catch (error) {
      console.log("editFloor error:", error);
      setMessage(error.message );
    }
  };

  const deleteFloor = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: "DELETE"
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Floor deleted successfully");
        loadFloors();
      } else {
        setMessage(data.error );
      }
    } catch (error) {
      console.log("deleteFloor error:", error);
      setMessage(error.message );
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Floors Management</h1>

        <div className="floors-form">
          <input
            type="number"
            placeholder="Floor Number"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />

          <input
            type="number"
            placeholder="Units"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />

          <input
            type="number"
            placeholder="Total SQM"
            value={sqm}
            onChange={(e) => setSqm(e.target.value)}
          />

          <button onClick={addFloor}>Add Floor</button>
        </div>

        {message && <p className="message">{message}</p>}

        <h2>Floors List</h2>

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
                    <button onClick={() => editFloor(item)}>Edit</button>
                    <button onClick={() => deleteFloor(item._id)}>Delete</button>
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
  );
}