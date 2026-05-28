import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { API_BASE, apiFetch, readResponse } from "../buildingSelection";

// Redirect unauthenticated users away from protected app pages.
export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");
  const [authStatus, setAuthStatus] = useState(token ? "checking" : "guest");

  useEffect(() => {
    let ignore = false;

    const verifySession = async () => {
      // A saved token must still be accepted by the backend before private screens render.
      if (!token) {
        setAuthStatus("guest");
        return;
      }

      setAuthStatus("checking");

      try {
        const res = await apiFetch(`${API_BASE}/session`, { cache: "no-store" });
        await readResponse(res);

        if (!res.ok) {
          throw new Error("Login required");
        }

        if (!ignore) {
          setAuthStatus("authenticated");
        }
      } catch {
        localStorage.removeItem("token");

        if (!ignore) {
          setAuthStatus("guest");
        }
      }
    };

    verifySession();

    return () => {
      ignore = true;
    };
  }, [token, location.pathname]);

  if (!token || authStatus === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (authStatus !== "authenticated") {
    return null;
  }

  return children;
}
