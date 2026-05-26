import { useCallback, useEffect, useState } from "react";
import { CONFIRM_ACTION_EVENT } from "./confirmAction";

// Single global confirm dialog. Pages call confirmAction() and this provider renders the modal.
export default function ConfirmDialogProvider() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    const handleConfirmRequest = (event) => {
      setRequest(event.detail);
    };

    window.addEventListener(CONFIRM_ACTION_EVENT, handleConfirmRequest);

    return () => {
      window.removeEventListener(CONFIRM_ACTION_EVENT, handleConfirmRequest);
    };
  }, []);

  const close = useCallback((confirmed) => {
    // Resolve the Promise created by confirmAction with true/false.
    request?.resolve?.(confirmed);
    setRequest(null);
  }, [request]);

  useEffect(() => {
    if (!request) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        close(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, request]);

  if (!request) {
    return null;
  }

  return (
    <div
      className="confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close(false);
        }
      }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.message}</p>
        <div className="confirm-actions">
          <button className="secondary-btn" onClick={() => close(false)}>
            {request.cancelText}
          </button>
          <button className="danger-btn" onClick={() => close(true)}>
            {request.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
