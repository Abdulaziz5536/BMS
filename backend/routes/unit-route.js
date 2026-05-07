const express = require("express");
const router = express.Router();
const Unit = require("../models/unit-model");
const Floor = require("../models/floor-model");
const Tenant = require("../models/tenant-model");

router.get('/units', async (req,res) => {
  try {
   const filter = req.query.building ? { building: req.query.building } : {};
   const units = await Unit.find(filter).populate("floor").lean();
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

  const floorRecord = await Floor.findOne({ _id: floor, building });

  if (!floorRecord) {
    return res.status(400).json({ error: "Floor does not belong to this building" });
  }

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
    { new: true }
  );

  if(!updatedUnit){
    return res.status(404).json({ error: "unit not found" });
  }

  res.json({ message: "unit updated", updatedUnit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/units/:id', async (req,res) => {
  try {
    const unit = await Unit.findByIdAndDelete(req.params.id);

    if(!unit){
      return res.status(404).json({ error: "unit not found" });
    }

    res.json({message:"unit deleted"});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

module.exports = router;
