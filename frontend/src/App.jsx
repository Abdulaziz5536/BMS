import { Routes, Route } from "react-router-dom";

import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./pages/Dashboard";
import Buildings from "./pages/Buildings";
import Floors from "./pages/Floors";
import Unit from "./pages/Unit";
import Tenants from "./pages/Tenants";
import Contracts from "./pages/Contracts"; 
import Employees from "./pages/Employees";
import Utilities from "./pages/Utilities";
import Invoice from "./pages/Invoice";
import Rent from "./pages/Rent";
import Announcements from "./pages/Announcements";

import ConfirmDialogProvider from "./components/ConfirmDialog";
import ProtectedRoute from "./components/ProtectedRoute";


function App() {
  return (
    <>
    <ConfirmDialogProvider />
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
        path="/buildings"
        element={
          <ProtectedRoute>
            <Buildings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/rent"
        element={
          <ProtectedRoute>
            <Rent />
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

      <Route
        path="/utilities"
        element={
          <ProtectedRoute>
            <Utilities />
          </ProtectedRoute>
        }
      />

      <Route
        path="/invoice"
        element={
          <ProtectedRoute>
            <Invoice />
          </ProtectedRoute>
        }
      />

      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <Announcements />
          </ProtectedRoute>
        }
      />
    </Routes>
    </>
  );
}


export default App;
