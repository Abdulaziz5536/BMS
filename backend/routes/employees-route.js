const express = require('express');
const router = express.Router();
const Employee = require('../models/employees-model');

router.get('/employees', async(req,res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    const employee = await Employee.find(filter);
    res.json(employee);
  } catch (error) {
    res.status(500).json({error:error.message});
  }

})

router.post('/employees', async (req,res) => {
  try{
       const {building,name,position,phoneNumber} = req.body;
       const normalizedName = String(name || "").trim();
       const normalizedPosition = String(position || "").trim();
       const normalizedPhoneNumber = String(phoneNumber || "").trim();

       if(!building || !normalizedName || !normalizedPosition || !normalizedPhoneNumber){
        return res.status(400).json({error:"Please fill in all fields"});
       }

       const existingEmployee = await Employee.findOne({
        building,
        name: normalizedName,
        position: normalizedPosition,
        phoneNumber: normalizedPhoneNumber
       }).collation({ locale: "en", strength: 2 });

       if(existingEmployee){
        return res.status(400).json({error:"employee already exists"});
       }

       const employee = await Employee.create({
        building,
        name: normalizedName,
        position: normalizedPosition,
        phoneNumber: normalizedPhoneNumber
       });
       res.json({message:"employee created", employee})
  }catch(err){
    res.status(500).json({err:err.message});
  }
  

});

router.put('/employees/:id', async (req,res) => {
  try {
    const {building,name,position,phoneNumber} = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedPosition = String(position || "").trim();
    const normalizedPhoneNumber = String(phoneNumber || "").trim();

    if(!building || !normalizedName || !normalizedPosition || !normalizedPhoneNumber){
      return res.status(400).json({error:"Please fill in all fields"});
    }

    const existingEmployee = await Employee.findOne({
      building,
      name: normalizedName,
      position: normalizedPosition,
      phoneNumber: normalizedPhoneNumber,
      _id: { $ne: req.params.id }
    }).collation({ locale: "en", strength: 2 });

    if(existingEmployee){
      return res.status(400).json({error:"employee already exists"});
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      {
        building,
        name: normalizedName,
        position: normalizedPosition,
        phoneNumber: normalizedPhoneNumber
      },
      {new:true}
    );

    if(!employee){
      return res.status(404).json({err:"employee not found"});
    }

    res.json({message:"employee updated", employee});
  } catch (err) {
    res.status(500).json({err:err.message});
  }
});

router.delete('/employees/:id', async (req,res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);

    if(!employee){
      return res.status(404).json({err:"employee not found"});
    }

    res.json({message:"employee deleted"});
  } catch (err) {
    res.status(500).json({err:err.message});
  }
})

module.exports = router;
