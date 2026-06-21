const buildOutstandingRentFilter = (buildingId) => {
  const filter = {
    outstandingBalance: { $gt: 0 },
    status: { $ne: "cancelled" }
  };

  if (buildingId) {
    filter.building = buildingId;
  }

  return filter;
};

module.exports = {
  buildOutstandingRentFilter
};
