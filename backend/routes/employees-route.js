const express = require('express');
const router = express.Router();
const Employee = require('../models/employees-model');

router.post('/employees', async (req,res) => {
  try{
       const {name,position} = req.body;

       const employee = await Employee.create({name,position});
       res.json({message:"employee created"})
  }catch(err){
    res.status(500).json({err:err.message});
  }
  

});

router.delete('/employee/:id', async (req,res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    res.json();
  } catch (error) {
    res.status(500).json({err:err.message});
  }
})

module.exports = router;