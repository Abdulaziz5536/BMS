const MIN_BASEMENT_FLOOR = -4;

// Shared formatter so backend exports/audit logs and frontend screens use the same floor labels.
const formatFloorLabel = (floor) => {
  if (floor === null || floor === undefined || floor === "") {
    return "-";
  }

  const floorNumber = Number(floor);

  if (Number.isFinite(floorNumber)) {
    if (floorNumber === 0) {
      return "G";
    }

    if (Number.isInteger(floorNumber) && floorNumber >= MIN_BASEMENT_FLOOR && floorNumber < 0) {
      return `B${Math.abs(floorNumber)}`;
    }
  }

  return String(floor);
};

module.exports = {
  formatFloorLabel,
  MIN_BASEMENT_FLOOR
};
