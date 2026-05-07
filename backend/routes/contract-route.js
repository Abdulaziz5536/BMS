const express = require('express');
const router = express.Router();
const Contract = require('../models/contract-model');
const Tenant = require('../models/tenant-model');


router.get('/contract', async (req,res) => {
  try {
    const filter = req.query.building ? { building: req.query.building } : {};
    const contract = await Contract.find(filter).populate({
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
    const {
      building,
      tenant,
      amount,
      date,
      leaseStartDate,
      leaseEndDate,
      contractLength,
      paymentFrequency
    } = req.body;
    const startDate = leaseStartDate || date;

    if(!building || !tenant || !amount || !startDate || !leaseEndDate || !paymentFrequency){
      return res.status(400).json({error:"Please fill in all fields"});
    }

    if (Date.parse(leaseEndDate) < Date.parse(startDate)) {
      return res.status(400).json({error:"Lease end date cannot be before lease start date"});
    }

    const tenantRecord = await Tenant.findOne({ _id: tenant, building });

    if(!tenantRecord){
      return res.status(400).json({error:"Tenant does not belong to this building"});
    }
 
  const contract = await Contract.create({
    building,
    tenant,
    amount:Number(amount),
    date: startDate,
    leaseStartDate: startDate,
    leaseEndDate,
    contractLength,
    paymentFrequency
  });
  res.json({message:"contract created", contract});

  }catch(err){
    res.status(500).json({err:err.message});
  }
});

router.put('/contract/:id', async (req, res) => {
  try {
    if (Object.keys(req.body || {}).length > 0) {
      const {
        building,
        tenant,
        amount,
        date,
        leaseStartDate,
        leaseEndDate,
        contractLength,
        paymentFrequency,
        status
      } = req.body;
      const startDate = leaseStartDate || date;

      if(!building || !tenant || !amount || !startDate || !leaseEndDate || !paymentFrequency){
        return res.status(400).json({error:"Please fill in all fields"});
      }

      if (Date.parse(leaseEndDate) < Date.parse(startDate)) {
        return res.status(400).json({error:"Lease end date cannot be before lease start date"});
      }

      const tenantRecord = await Tenant.findOne({ _id: tenant, building });

      if(!tenantRecord){
        return res.status(400).json({error:"Tenant does not belong to this building"});
      }

      const updatedContract = await Contract.findByIdAndUpdate(
        req.params.id,
        {
          building,
          tenant,
          amount: Number(amount),
          date: startDate,
          leaseStartDate: startDate,
          leaseEndDate,
          contractLength,
          paymentFrequency,
          status: status || "pending"
        },
        { new: true }
      );

      if (!updatedContract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      return res.json({
        message: "Contract updated",
        contract: updatedContract
      });
    }

    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    contract.status = "paid";
    await contract.save();

    return res.json({
      message: "Payment marked as paid",
      contract
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/contract/:id/pay', async (req, res) => {
  try {
    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      { status: "paid" },
      { new: true }
    );

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    return res.json({
      message: "Payment marked as paid",
      contract
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/contract/:id', async (req,res) => {
  try{
    const contract = await Contract.findByIdAndDelete(req.params.id);

    if(!contract){
      return res.status(404).json({error:"Contract not found"});
    }

    res.json({message:"contract removed"});

  }catch(err){
    res.status(500).json({err:err.message});
  }
});

module.exports = router;
