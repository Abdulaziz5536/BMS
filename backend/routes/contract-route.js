const express = require('express');
const router = express.Router();
const Contract = require('../models/contract-model');

router.get('/contract', async (req,res) => {
  try {
    const contract = await Contract.find().populate({
      path: "tenant",
      populate: {
        path: "unit",
        populate: {
          path: "floor"
        }
      }
    });
    res.json(contract);
    
  } catch (error) {
    res.status(500).json({error:error.message});
  }
})

router.post('/contract', async (req,res) => {
  
  try{
    const {tenant,amount,date,contractLength,paymentFrequency} = req.body;
 
  await Contract.create({tenant,amount,date,contractLength,paymentFrequency});
  res.json({message:"contract created"});

  }catch(err){
    res.status(500).json({err:err.message});
  }
});

router.put('/contract/:id', async (req,res) => {
  try{
    const {tenant,amount,date,contractLength,paymentFrequency} = req.body;

    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      {tenant,amount,date,contractLength,paymentFrequency},
      {new:true}
    );

    if(!contract){
      return res.status(404).json({err:"contract not found"});
    }

    res.json({message:"contract updated", contract});
  }catch(err){
    res.status(500).json({err:err.message});
  }
});

router.delete('/contract/:id', async (req,res) => {
  try{
    await Contract.findByIdAndDelete(req.params.id);
    res.json({message:"contract removed"});

  }catch(err){
    res.status(500).json({err:err.message});
  }
});

module.exports = router;
