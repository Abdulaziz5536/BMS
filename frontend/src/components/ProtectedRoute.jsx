import { Navigate } from "react-router-dom";

// Redirect unauthenticated users away from protected app pages.
export default function ProtectedRoute({ children }) {

  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" />;
  }

  return children;

}
