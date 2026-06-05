import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./pages/Dashboard";
import PaymentStatus from "./pages/PaymentStatus";
import Buildings from "./pages/Buildings";
import Floors from "./pages/Floors";
import Unit from "./pages/Unit";
import Tenants from "./pages/Tenants";
import Contracts from "./pages/Contracts"; 
import Employees from "./pages/Employees";
import Utilities from "./pages/Utilities";
import Invoice from "./pages/Invoice";
import Announcements from "./pages/Announcements";
import Activity from "./pages/Activity";
import SystemTools from "./pages/SystemTools";
import Sidebar from "./pages/Sidebar";
import Maintenance from "./pages/Maintenance";  // ← ADD THIS LINE

import ConfirmDialogProvider from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { SidebarSuppressContext } from "./components/sidebarContext";
import { SIGNUP_ENABLED } from "./config";


function ProtectedAppLayout() {
  return (
    <ProtectedRoute>
      <div className="app-layout persistent-app-layout">
        <Sidebar persistent />
        <SidebarSuppressContext.Provider value={true}>
          <main className="main-content route-content">
            <Outlet />
          </main>
        </SidebarSuppressContext.Provider>
      </div>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <ConfirmDialogProvider />
    {/* Routes define the whole frontend navigation map. Protected pages require a login token. */}
    <Routes>

      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={SIGNUP_ENABLED ? <Signup /> : <Navigate to="/login" replace />} />

      <Route
        path="/payment-status"
        element={
          <ProtectedRoute>
            <PaymentStatus />
          </ProtectedRoute>
        }
      />

      <Route element={<ProtectedAppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/buildings" element={<Buildings />} />
        {/* Old rent route is kept as a redirect so saved bookmarks still work. */}
        <Route path="/rent" element={<Navigate to="/invoice" replace />} />
        <Route path="/floors" element={<Floors />} />
        <Route path="/units" element={<Unit />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/utilities" element={<Utilities />} />
        <Route path="/invoice" element={<Invoice />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/system" element={<SystemTools />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/accounts" element={<Navigate to="/system#accounts" replace />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}


export default App;
