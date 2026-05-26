import { formatErrorMessage, getApiErrorMessage } from "./errorUtils";
import { apiFetch } from "../buildingSelection";

// Download helpers create browser downloads for backup JSON and CSV exports.
export const downloadTextFile = (content, filename, type = "text/plain") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const downloadFromUrl = async (url, filename) => {
  // Fetch first so API errors can be shown instead of downloading an error page.
  const res = await apiFetch(url);
  const text = await res.text();

  if (!res.ok) {
    let message = text || "Download failed";

    try {
      message = getApiErrorMessage(JSON.parse(text), "Download failed");
    } catch {
      message = formatErrorMessage(message, "Download failed");
    }

    throw new Error(message);
  }

  downloadTextFile(text, filename, res.headers.get("content-type") || "text/plain");
};
