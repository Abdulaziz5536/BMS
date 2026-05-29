import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { API_BASE, apiFetch, readResponse } from "../buildingSelection";
import { clearCurrentUser, isReadOnlyUser, setCurrentUser } from "../authSession";

// Redirect unauthenticated users away from protected app pages.
export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");
  const [authStatus, setAuthStatus] = useState(token ? "checking" : "guest");
  const [sessionUser, setSessionUser] = useState(null);

  useEffect(() => {
    let ignore = false;

    const verifySession = async () => {
      // A saved token must still be accepted by the backend before private screens render.
      if (!token) {
        clearCurrentUser();
        setSessionUser(null);
        setAuthStatus("guest");
        return;
      }

      setAuthStatus("checking");

      try {
        const res = await apiFetch(`${API_BASE}/session`, { cache: "no-store" });
        const data = await readResponse(res);

        if (!res.ok) {
          throw new Error("Login required");
        }

        if (!ignore) {
          setSessionUser(setCurrentUser(data.user));
          setAuthStatus("authenticated");
        }
      } catch {
        localStorage.removeItem("token");
        clearCurrentUser();

        if (!ignore) {
          setSessionUser(null);
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

  if (isReadOnlyUser(sessionUser) && location.pathname !== "/payment-status") {
    return <Navigate to="/payment-status" replace />;
  }

  return children;
}
