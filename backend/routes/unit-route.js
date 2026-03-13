const express = require("express");
const router = express.Router();
const Unit = require("../models/unit-model");

router.get('/units', async (req,res) => {
   const units = await Unit.find().populate("floor");
    res.json(units);
    
})

router.post('/units', async (req,res) => {
 const {unitId,  area, type,floor} = req.body;

  const existingID = await Unit.findOne({unitId});
  if(existingID){
    return res.status(400).json({error:"unit id exists"});
  }
  const units = await Unit.create({unitId,  area, type,floor});
  res.json({message:"unit added"});

});

router.delete('/units/:id', async (req,res) => {
  await Unit.findByIdAndDelete(req.params.id);
  res.json({message:"unit deleted"});
})

module.exports = router;