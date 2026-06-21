const mongoose = require("mongoose");

const getId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  return String(value);
};

const getRecordBuildingId = (record) => getId(record?.building);

const getRequestedBuildingId = (req) =>
  getId(req?.query?.building || req?.body?.building || req?.body?.buildingId);

const validateRequestedBuildingId = (req, res) => {
  const buildingId = getRequestedBuildingId(req);

  if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
    res.status(400).json({ error: "Invalid building id" });
    return null;
  }

  return buildingId;
};

const ensureRecordMatchesRequestedBuilding = (req, res, record, label = "Record") => {
  const buildingId = validateRequestedBuildingId(req, res);

  if (buildingId === null) {
    return false;
  }

  if (buildingId && getRecordBuildingId(record) !== buildingId) {
    res.status(404).json({ error: `${label} not found` });
    return false;
  }

  return true;
};

module.exports = {
  ensureRecordMatchesRequestedBuilding,
  getRecordBuildingId,
  getRequestedBuildingId,
  validateRequestedBuildingId
};
