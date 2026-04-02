import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import "../style.css";

export default function Tenants() {

    const [tenantId,setTenantId] = useState("");
    const [unit, setunit] = useState("");
    const [Phone, setPhone] = useState("");
    const [tenants, setTenants] = useState([]);
    const [units,setUnits] = useState([]);
    const [message, setMessage] = useState(""); 
    
    
    const API = "http://localhost:3000/tenants";

    const fetchTenants = async () => {   
    
        const res = await fetch(API);   
        const data = await res.json();

        if (res.ok) {
        setTenants(data);
        
        } else {
        setMessage(data.error);
        }   
    } 

     useEffect(() => {
          fetchTenants();
    }, []); 

    const addTenant = async () => {
    
        const res = await fetch(API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ tenantId, unit, Phone })
        });

        const data = res.json();

        if(res.ok){
            setMessage(data.message);
            fetchTenants();

        }
        else{
            setMessage(data.error);
        }

    
    };

   

    return (
    <>
    <div style={{display:"flex"}}>
          <Sidebar />

          <div style={{padding:20}}>

            <h1>Tenants</h1>

          </div>
    </div>
       
    </> 
    );
}   


