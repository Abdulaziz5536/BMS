import { useState, useEffect } from "react";

function Unit() {
  const [unitId, setUnitId] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [units, setUnits] = useState([]);
  const [message, setMessage] = useState("");
  const [floors, setFloors] = useState([]);
  const [floor, setFloor] = useState("");

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

  const addUnit = async () => {
    const res = await fetch("http://localhost:3000/units", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ unitId, area, type, floor })
    });

    const data = await res.json();

    if (res.ok) {
      setMessage(data.message);
      fetchUnits();
    } else {
      setMessage(data.error);
    }
  };

  const removeUnit = async (id) => {
    await fetch(`http://localhost:3000/units/${id}`, {
      method: "DELETE"
    });

    fetchUnits();
  };

  return (
    <>
      <h1>Units</h1>

      <input
        placeholder="unitId"
        onChange={(e) => setUnitId(e.target.value)}
      />

      <input
        placeholder="area"
        onChange={(e) => setArea(e.target.value)}
      />

      <input
        placeholder="type"
        onChange={(e) => setType(e.target.value)}
      />

      <select onChange={(e) => setFloor(e.target.value)}>
        <option value="">Select Floor</option>

        {floors.map((f) => (
          <option key={f.id} value={f.id}>
            {f.number}
          </option>
        ))}
      </select>

      <button onClick={addUnit}>Add Unit</button>

      <p>{message}</p>
      <hr />

      <h2>List Units</h2>
        {units.map((u) => (
          <div key={u.id}>
            <p>Unit ID: {u.unitId}</p>
            <p>Area: {u.area}</p>
            <p>Type: {u.type}</p>
            <p>Floor: {u.floor}</p>
            <button onClick={() => removeUnit(u.id)}>Remove</button>
          </div>
        ))}
    </>
  );
}

export default Unit;