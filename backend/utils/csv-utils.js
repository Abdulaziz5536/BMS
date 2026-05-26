const escapeCsvValue = (value) => {
  // CSV cells with commas, quotes, or line breaks must be quoted for spreadsheet compatibility.
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = value instanceof Date
    ? value.toISOString()
    : String(value);

  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
};

const buildCsv = (rows, columns) => {
  // Columns define both the header text and how each row value is extracted.
  const header = columns.map((column) => escapeCsvValue(column.label)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvValue(column.value(row))).join(",")
  );

  return [header, ...body].join("\n");
};

module.exports = {
  buildCsv
};
