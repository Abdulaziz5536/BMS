export const formatFloorLabel = (floor) => {
  // Display -1..-4 as basement labels B1..B4 and 0 as ground floor G.
  if (floor === null || floor === undefined || floor === "") {
    return "-";
  }

  const floorNumber = Number(floor);

  if (Number.isFinite(floorNumber)) {
    if (floorNumber === 0) {
      return "G";
    }

    if (Number.isInteger(floorNumber) && floorNumber >= -4 && floorNumber < 0) {
      return `B${Math.abs(floorNumber)}`;
    }
  }

  return floor;
};
