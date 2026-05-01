const express = require('express');
const router = express.Router();
const Tenant = require('../models/tenant-model');


router.get('/tenants', async (req,res) => {
  try{
    const tenants = await Tenant.find().populate("unit");
    res.json(tenants);
  }
  catch(error){
    res.status(500).json({error:error.message});
  }
  
});

router.post('/tenants', async (req,res) => {
  try {
    const {tenantId,tenantName,phone,unit} = req.body;

    if(!tenantId || !tenantName || !phone || !unit){
      return res.status(400).json({error:"fields should not be empty"});
    }

    await Tenant.create({tenantId,tenantName,phone,unit});
    res.json({message:"tenant added"});
    
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

router.put('/tenants/:id', async (req,res) => {
  try {
    const {tenantId,tenantName,phone,unit} = req.body;

    if(!tenantId || !tenantName || !phone || !unit){
      return res.status(400).json({error:"fields should not be empty"});
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      {tenantId,tenantName,phone,unit},
      {new:true}
    );

    if(!tenant){
      return res.status(404).json({error:"tenant not found"});
    }

    res.json({message:"tenant updated", tenant});
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

router.delete('/tenants/:id', async (req,res) => {
  try {
    await Tenant.findByIdAndDelete(req.params.id);
    res.json({message:"tenant removed"});
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

module.exports = router;
