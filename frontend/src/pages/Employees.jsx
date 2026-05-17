import { useEffect, useRef, useState } from "react";
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

export default function Employees() {
  const selectedBuildingId = useSelectedBuilding();
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [editingId, setEditingId] = useState(null);
  const employeeFormRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearForm = () => {
    setName("");
    setPosition("");
    setPhoneNumber("");
    setEditingId(null);
  };

  const fetchEmployees = async (useCache = true) => {
    if (!selectedBuildingId) {
      setEmployees([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/employees", selectedBuildingId),
      setEmployees,
      setError,
      "Failed to load employees",
      { useCache }
    );
  };

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    fetchEmployees();
  }, [selectedBuildingId]);

  useEffect(() => {
    if (editingId) {
      employeeFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const saveEmployee = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!name || !position || !phoneNumber) {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/employees/${editingId}` : `${API_BASE}/employees`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            name,
            position,
            phoneNumber
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Employee updated" : "Employee added"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchEmployees(false);
      } else {
        setError(data.error || data.err || "Failed to save employee");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editEmployee = (employee) => {
    setName(employee.name || "");
    setPosition(employee.position || "");
    setPhoneNumber(employee.phoneNumber || "");
    setEditingId(employee._id);
    setMessage("");
    setError("");
  };

  const deleteEmployee = async (id) => {
    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/employees/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Employee deleted");
        invalidateCache(selectedBuildingId);
        fetchEmployees(false);
      } else {
        setError(data.error || data.err || "Failed to delete employee");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Employees</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing employees.</p>
        )}

        <section className="panel" ref={employeeFormRef}>
          <h2>{editingId ? "Edit Employee" : "Add Employee"}</h2>

          <div className="form-grid">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="text"
              placeholder="Position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="tel"
              placeholder="Phone Number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={!selectedBuildingId}
            />
          </div>

          <div className="form-actions">
            <button onClick={saveEmployee} disabled={!selectedBuildingId}>
              {editingId ? "Update Employee" : "Add Employee"}
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

        <h2>Employees List</h2>

        <div className="floors-table-wrapper">
        <table className="floors-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Position</th>
              <th>Phone Number</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {employees.length > 0 ? (
              employees.map((employee) => (
                <tr key={employee._id}>
                  <td>{employee.name}</td>
                  <td>{employee.position}</td>
                  <td>{employee.phoneNumber || "-"}</td>
                  <td>
                    <div className="table-action-stack">
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editEmployee(employee)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => deleteEmployee(employee._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">No employees added yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
