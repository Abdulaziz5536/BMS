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
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Download failed");
  }

  downloadTextFile(text, filename, res.headers.get("content-type") || "text/plain");
};
