const express = require('express');
const router = express.Router();
const Employee = require('../models/employees-model');

router.get('/employees', async(req,res) => {
  try {
    const employee = await Employee.find();
    res.json(employee);
  } catch (error) {
    res.status(500).json({error:error.message});
  }

})

router.post('/employees', async (req,res) => {
  try{
       const {name,position,phoneNumber} = req.body;

       const employee = await Employee.create({name,position,phoneNumber});
       res.json({message:"employee created"})
  }catch(err){
    res.status(500).json({err:err.message});
  }
  

});

router.put('/employees/:id', async (req,res) => {
  try {
    const {name,position,phoneNumber} = req.body;

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      {name,position,phoneNumber},
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
    await Employee.findByIdAndDelete(req.params.id);
    res.json({message:"employee deleted"});
  } catch (err) {
    res.status(500).json({err:err.message});
  }
})

module.exports = router;
