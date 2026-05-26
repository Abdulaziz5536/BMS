export const DEFAULT_BRAND_NAME = "Building Management System";

// Building-aware screens use this so receipts/payroll/reminders never fall back to old hardcoded names.
export const getBuildingBrandName = (building, fallback = DEFAULT_BRAND_NAME) => {
  const rawName = typeof building === "string" ? building : building?.name;
  const name = String(rawName || "").replace(/\s+/g, " ").trim();

  return name || fallback;
};
