import { Routes, Route } from "react-router-dom";

import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./pages/dashboard";
import Floors from "./pages/floors";
import Unit from "./pages/Unit";
import Tenants from "./pages/Tenants";
import Contracts from "./pages/Contracts"; 
import Employees from "./pages/Employees";

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
            <Unit />
          </ProtectedRoute>
        }
      />

      <Route
        path="/tenants"
        element={
          <ProtectedRoute>
            <Tenants />
          </ProtectedRoute>
        }
      />

      
      <Route
        path="/contracts"
        element={
          <ProtectedRoute>
            <Contracts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={ 
          <ProtectedRoute>
            <Employees />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}


export default App;