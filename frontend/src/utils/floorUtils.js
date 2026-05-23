export const formatFloorLabel = (floor) => {
  if (floor === 0 || floor === "0") {
    return "G";
  }

  if (floor === null || floor === undefined || floor === "") {
    return "-";
  }

  return floor;
};
