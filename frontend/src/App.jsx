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
import Activity from "./pages/Activity";
import SystemTools from "./pages/SystemTools";
import Sidebar from "./pages/Sidebar";

import ConfirmDialogProvider from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { SidebarSuppressContext } from "./components/sidebarContext";

function ProtectedAppPage({ children }) {
  return (
    <ProtectedRoute>
      <div className="app-layout persistent-app-layout">
        <Sidebar persistent />
        <SidebarSuppressContext.Provider value={true}>
          <main className="main-content route-content">
            {children}
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
    <Routes>

      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedAppPage>
            <Dashboard />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/buildings"
        element={
          <ProtectedAppPage>
            <Buildings />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/rent"
        element={
          <ProtectedAppPage>
            <Rent />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/floors"
        element={
          <ProtectedAppPage>
            <Floors />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/units"
        element={
          <ProtectedAppPage>
            <Unit />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/tenants"
        element={
          <ProtectedAppPage>
            <Tenants />
          </ProtectedAppPage>
        }
      />

      
      <Route
        path="/contracts"
        element={
          <ProtectedAppPage>
            <Contracts />
          </ProtectedAppPage>
        }
      />
      <Route
        path="/employees"
        element={ 
          <ProtectedAppPage>
            <Employees />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/utilities"
        element={
          <ProtectedAppPage>
            <Utilities />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/invoice"
        element={
          <ProtectedAppPage>
            <Invoice />
          </ProtectedAppPage>
        }
      />

      <Route
        path="/announcements"
        element={
          <ProtectedAppPage>
            <Announcements />
          </ProtectedAppPage>
        }
      />
      <Route
        path="/activity"
        element={
          <ProtectedAppPage>
            <Activity />
          </ProtectedAppPage>
        }
      />
      <Route
        path="/system"
        element={
          <ProtectedAppPage>
            <SystemTools />
          </ProtectedAppPage>
        }
      />
    </Routes>
    </ErrorBoundary>
  );
}


export default App;
