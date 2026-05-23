import { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  DocumentMagnifyingGlassIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";

const isImageFile = (file) =>
  file?.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file?.name || "");

const isPdfFile = (file) =>
  file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");

export default function FilePreviewLink({ file, label }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!file?.data) {
    return "-";
  }

  const displayLabel = label || file.name || "Document";
  const canPreviewImage = isImageFile(file);
  const canPreviewPdf = isPdfFile(file);

  return (
    <>
      <span className="file-preview-actions">
        <button
          type="button"
          className="file-link file-preview-trigger"
          onClick={() => setIsOpen(true)}
          title={`View ${displayLabel}`}
        >
          <DocumentMagnifyingGlassIcon />
          <span>{displayLabel}</span>
        </button>
        <a
          className="file-download-btn"
          href={file.data}
          download={file.name || displayLabel}
          title={`Download ${displayLabel}`}
          aria-label={`Download ${displayLabel}`}
        >
          <ArrowDownTrayIcon />
        </a>
      </span>

      {isOpen && (
        <div
          className="file-preview-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div className="file-preview-dialog" role="dialog" aria-modal="true">
            <div className="file-preview-header">
              <div>
                <p>Read-only preview</p>
                <h2>{file.name || displayLabel}</h2>
              </div>
              <div className="file-preview-header-actions">
                <a className="secondary-btn" href={file.data} download={file.name || displayLabel}>
                  <ArrowDownTrayIcon />
                  Download
                </a>
                <button className="icon-only-btn secondary-btn" onClick={() => setIsOpen(false)} title="Close preview">
                  <XMarkIcon />
                </button>
              </div>
            </div>

            <div className="file-preview-body">
              {canPreviewImage && (
                <img src={file.data} alt={file.name || displayLabel} />
              )}
              {canPreviewPdf && !canPreviewImage && (
                <iframe src={file.data} title={file.name || displayLabel} />
              )}
              {!canPreviewImage && !canPreviewPdf && (
                <div className="file-preview-empty">
                  <DocumentMagnifyingGlassIcon />
                  <p>This file type cannot be previewed in the browser.</p>
                  <a className="secondary-btn" href={file.data} download={file.name || displayLabel}>
                    <ArrowDownTrayIcon />
                    Download file
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
