import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import "../style.css";

export default function Tenants() {

    const [unit, setunit] = useState("");
    const [Email, setEmail] = useState("");
    const [Phone, setPhone] = useState("");
    const [Name, setName] = useState("");
    const [tenants, setTenants] = useState([]);
    const [message, setMessage] = useState(""); 
    
    
    const API = "http://localhost:3000/tenants";

    const loadTenants = async () => {   
    try {
        const res = await fetch(API);   
        const data = await res.json();

        if (res.ok) {
        setTenants(data);
        setMessage("");
        } else {
        setMessage(data.error );
        }   
    } catch (error) {
        console.log("loadTenants fetch error:", error);
        setMessage(error.message );
    }
    };

    const addTenant = async () => {
    setMessage(""); 
    if (!unit || !Email || !Phone || !Name) {
        setMessage("Please fill in all fields");
        return; 
    }


    try {
        const res = await fetch(API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ unit, Email, Phone, Name })
        });
        const text = await res.text();
        console.log("POST /tenants raw response:", text);
        const data = text ? JSON.parse(text) : {};

    } catch (error) {
        console.log("addTenant fetch error:", error);
        setMessage(error.message);
    }
    };

    useEffect(() => {
    loadTenants();
    }, []); 

    return (
    <>
        <Sidebar />
    </> 
    );
}   


