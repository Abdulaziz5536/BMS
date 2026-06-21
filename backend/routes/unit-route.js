const express = require("express");
const router = express.Router();
const Unit = require("../models/unit-model");
const Floor = require("../models/floor-model");
const Tenant = require("../models/tenant-model");
const { recordAuditLog } = require("../services/audit-log-service");
const { ensureRecordMatchesRequestedBuilding } = require("../utils/building-scope-utils");

// Unit routes manage rentable spaces. A unit is linked to one building and one floor.
// The GET route also calculates whether each unit is occupied by looking at tenants.

router.get('/units', async (req,res) => {
  try {
   const filter = req.query.building ? { building: req.query.building } : {};
   const units = await Unit.find(filter).populate("floor").lean();
   // Occupancy is derived from tenants so unit status cannot drift out of sync.
   const occupiedUnitIds = await Tenant.distinct("unit", filter);
   const occupiedUnitSet = new Set(occupiedUnitIds.map((id) => String(id)));
   const unitsWithStatus = units.map((unit) => ({
    ...unit,
    status: occupiedUnitSet.has(String(unit._id)) ? "Occupied" : "Available"
   }));

    res.json(unitsWithStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

router.post('/units', async (req,res) => {
 try {
 const {building, unitId, area, type, floor} = req.body;
  const normalizedUnitId = String(unitId || "").trim();
  const normalizedArea = String(area || "").trim();
  const normalizedType = String(type || "").trim();

  if (!building || !normalizedUnitId || !normalizedArea || !normalizedType || !floor) {
    return res.status(400).json({ error: "Please fill all fields" });
  }

  // Prevent assigning a unit to a floor from another building.
  const floorRecord = await Floor.findOne({ _id: floor, building });

  if (!floorRecord) {
    return res.status(400).json({ error: "Floor does not belong to this building" });
  }

  // Case-insensitive duplicate check keeps "A-101" and "a-101" from becoming two units.
  const existingID = await Unit.findOne({
    building,
    unitId: normalizedUnitId
  }).collation({ locale: "en", strength: 2 });

  if(existingID){
    return res.status(400).json({error:"unit id exists"});
  }

  const unit = await Unit.create({
    building,
    unitId: normalizedUnitId,
    area: normalizedArea,
    type: normalizedType,
    floor
  });

  await recordAuditLog({
    building: unit.building,
    action: "created",
    entityType: "unit",
    entityId: unit._id,
    entityLabel: unit.unitId,
    message: `Unit ${unit.unitId} created`
  });

  res.json({message:"unit added", unit});
 } catch (error) {
  res.status(500).json({ error: error.message });
 }

});

router.put('/units/:id', async (req,res) => {
  try {
  const { building, unitId, area, type, floor } = req.body;
  const normalizedUnitId = String(unitId || "").trim();
  const normalizedArea = String(area || "").trim();
  const normalizedType = String(type || "").trim();

  if (!building || !normalizedUnitId || !normalizedArea || !normalizedType || !floor) {
    return res.status(400).json({ error: "Please fill all fields" });
  }

  const currentUnit = await Unit.findById(req.params.id);

  if (!currentUnit) {
    return res.status(404).json({ error: "unit not found" });
  }

  if (!ensureRecordMatchesRequestedBuilding(req, res, currentUnit, "Unit")) {
    return;
  }

  const floorRecord = await Floor.findOne({ _id: floor, building });

  if (!floorRecord) {
    return res.status(400).json({ error: "Floor does not belong to this building" });
  }

  const existingID = await Unit.findOne({
    building,
    unitId: normalizedUnitId,
    _id: { $ne: req.params.id }
  }).collation({ locale: "en", strength: 2 });

  if(existingID){
    return res.status(400).json({ error: "unit id exists" });
  }

  const updatedUnit = await Unit.findByIdAndUpdate(
    req.params.id,
    {
      building,
      unitId: normalizedUnitId,
      area: normalizedArea,
      type: normalizedType,
      floor
    },
    { returnDocument: "after" }
  );

  if(!updatedUnit){
    return res.status(404).json({ error: "unit not found" });
  }

  await recordAuditLog({
    building: updatedUnit.building,
    action: "updated",
    entityType: "unit",
    entityId: updatedUnit._id,
    entityLabel: updatedUnit.unitId,
    message: `Unit ${updatedUnit.unitId} updated`
  });

  res.json({ message: "unit updated", updatedUnit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/units/:id', async (req,res) => {
  try {
    const unit = await Unit.findById(req.params.id);

    if(!unit){
      return res.status(404).json({ error: "unit not found" });
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, unit, "Unit")) {
      return;
    }

    // A unit with a tenant cannot be deleted until the tenant is moved or removed.
    const tenantCount = await Tenant.countDocuments({ unit: req.params.id });

    if (tenantCount > 0) {
      return res.status(400).json({
        error: "Cannot delete this unit because a tenant is assigned to it. Move or delete the tenant first."
      });
    }

    await Unit.deleteOne({ _id: unit._id });

    await recordAuditLog({
      building: unit.building,
      action: "deleted",
      entityType: "unit",
      entityId: unit._id,
      entityLabel: unit.unitId,
      message: `Unit ${unit.unitId} deleted`
    });

    res.json({message:"unit deleted"});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

module.exports = router;
