import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import "../style.css";
import { data } from "react-router-dom";


export default function Employees() {

  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [message, setMessage] = useState("");

  const API = "http://localhost:3000";

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API}/employees`);
        const data = await res.json();
          setEmployees(data);
    } 
    
    
    catch (error) {
      setMessage(error.message);
    }
  };        

useEffect(() => {
  fetchEmployees();
    }, []); 


    const addEmployee = async () => {       
        if (!name || !position) {
            setMessage("Fill all fields");
            return;
        }

        try {
            const res = await fetch(`${API}/employees`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name, position })
           });   const text = await res.text();
            console.log("POST /employees raw response:", text);

            const data = text ? JSON.parse(text) : {};

            if (res.ok) {   
                setMessage(data.message);
                setName("");
                setPosition("");
                fetchEmployees();
            }
            else {
                setMessage(data.error);
            }
        } catch (error) {
            setMessage(error.message);
        }
        };  
    return (
        <div className="container">
            <Sidebar />
            <div className="content">
                <h1>Employees</h1>  
                <div className="form">
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
                    <button onClick={addEmployee}>Add Employee</button>
                </div>
                {message && <p>{message}</p>}
                <div className="employee-list">
                    {employees.map((employee) => (
                        <div key={employee._id} className="employee-item">
                            <h3>{employee.name}</h3>
                            <p>{employee.position}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}