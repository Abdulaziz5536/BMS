import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./components/Dashboard";
import Floors from "./components/Floors";
import Unit from "./components/Unit";


import ProtectedRoute from "./components/ProtectedRoute";

function App() {

  return (

    <Routes>

      <Route path="/" element={<Login />} />   {/* ADD THIS */}
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

<Route  path="/units" element={<Unit/>}/>
  

    </Routes>

  );
}

export default App;