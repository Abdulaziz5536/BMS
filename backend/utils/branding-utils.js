const DEFAULT_BRAND_NAME = process.env.APP_NAME || "Building Management System";

// Building-aware messages call this so receipts/reminders use the selected building name.
const getBuildingBrandName = (building, fallback = DEFAULT_BRAND_NAME) => {
  const rawName = typeof building === "string" ? building : building?.name;
  const name = String(rawName || "").replace(/\s+/g, " ").trim();

  return name || fallback;
};

module.exports = {
  DEFAULT_BRAND_NAME,
  getBuildingBrandName
};
