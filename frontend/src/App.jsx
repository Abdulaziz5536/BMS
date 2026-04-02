import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./components/Dashboard";
import Floors from "./components/Floors";
import Unit from "./components/Unit";
import Tenants from "./pages/Tenants";


import ProtectedRoute from "./components/ProtectedRoute";

function App() {

  return (

    <Routes>

      <Route path="/" element={<Login />} />   
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/floors"
        element={
          <ProtectedRoute>
            <Floors />
          </ProtectedRoute>
        }
      />

      <Route  
         path="/units" 
         element={
         <ProtectedRoute>
            <Unit/>
         </ProtectedRoute>}/>
  
      <Route
          path="/tenants"
          elements={
            <ProtectedRoute>
             <Tenants />
            </ProtectedRoute>
              
            
          }>
        
      </Route>

      </Routes>

  );
}

export default App;