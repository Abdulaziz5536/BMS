import { useCallback, useState } from "react";
import { formatErrorMessage } from "../utils/errorUtils";

// Hook that stores user-safe short error text instead of raw backend/provider messages.
export default function useShortError() {
  const [error, setErrorState] = useState("");

  const setError = useCallback((value, fallback = "") => {
    setErrorState(formatErrorMessage(value, fallback));
  }, []);

  return [error, setError];
}
