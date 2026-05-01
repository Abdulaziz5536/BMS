import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import "../style.css";

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const API = "http://localhost:3000";

  const readResponse = async (res) => {
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "";

    if (!text) {
      return {};
    }

    if (contentType.includes("application/json")) {
      return JSON.parse(text);
    }

    throw new Error("Backend returned a non-JSON response. Restart the backend server and try again.");
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API}/employees`);
      const data = await readResponse(res);

      if (res.ok) {
        setEmployees(data);
      } else {
        setError(data.error || data.err || "Failed to load employees");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const clearForm = () => {
    setName("");
    setPosition("");
    setPhoneNumber("");
    setEditingId(null);
  };

  const saveEmployee = async () => {
    setMessage("");
    setError("");

    if (!name || !position || !phoneNumber) {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API}/employees/${editingId}` : `${API}/employees`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name, position, phoneNumber })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Employee updated" : "Employee added"));
        clearForm();
        fetchEmployees();
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

      const res = await fetch(`${API}/employees/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Employee deleted");
        fetchEmployees();
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

        <section className="panel">
          <h2>{editingId ? "Edit Employee" : "Add Employee"}</h2>

          <div className="form-grid">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              type="text"
              placeholder="Position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />

            <input
              type="tel"
              placeholder="Phone Number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button onClick={saveEmployee}>
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
                    <button onClick={() => editEmployee(employee)}>
                      Edit
                    </button>
                    <button className="danger-btn" onClick={() => deleteEmployee(employee._id)}>
                      Delete
                    </button>
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
  );
}
