const express = require('express');
const router = express.Router();
const Tenant = require('../models/tenant-model');
const Unit = require('../models/unit-model');
const Contract = require('../models/contract-model');
const Invoice = require('../models/invoice-model');
const RentInvoice = require('../models/rent-invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Utility = require('../models/utility-model');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput
} = require('../utils/date-utils');

const MAX_FILE_DATA_LENGTH = 7000000;

const normalizeTenantPayload = (body) => ({
  email: String(body.email || "").trim(),
  emergencyContactName: String(body.emergencyContactName || "").trim(),
  emergencyContactPhone: String(body.emergencyContactPhone || "").trim(),
  emergencyContactRelation: String(body.emergencyContactRelation || "").trim(),
  moveInDate: normalizeDateOnlyString(body.moveInDate),
  moveOutDate: normalizeDateOnlyString(body.moveOutDate),
  idLicenseFile: body.idLicenseFile || undefined,
  leaseAgreementFile: body.leaseAgreementFile || undefined
});

const isValidEmail = (email) => {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidFile = (file) => {
  if (!file) {
    return true;
  }

  return Boolean(
    file.name &&
    file.type &&
    file.data &&
    typeof file.data === "string" &&
    file.data.length <= MAX_FILE_DATA_LENGTH
  );
};


router.get('/tenants', async (req,res) => {
  try{
    const filter = req.query.building ? { building: req.query.building } : {};
    const tenants = await Tenant.find(filter).populate({
      path: "unit",
      populate: {
        path: "floor"
      }
    });
    res.json(tenants);
  }
  catch(error){
    res.status(500).json({error:error.message});
  }
  
});

router.post('/tenants', async (req,res) => {
  try {
    const {building, tenantId,tenantName,phone,unit} = req.body;
    const normalizedTenantId = Number(tenantId);
    const normalizedTenantName = String(tenantName || "").trim();
    const normalizedPhone = Number(phone);
    const extraTenantData = normalizeTenantPayload(req.body);

    if(!building || !tenantId || !normalizedTenantName || !phone || !unit){
      return res.status(400).json({error:"fields should not be empty"});
    }

    if(!Number.isFinite(normalizedTenantId) || !Number.isFinite(normalizedPhone)){
      return res.status(400).json({error:"Tenant ID and phone must be valid numbers"});
    }

    if(!isValidEmail(extraTenantData.email)){
      return res.status(400).json({error:"Invalid email format"});
    }

    if(!isValidFile(extraTenantData.idLicenseFile) || !isValidFile(extraTenantData.leaseAgreementFile)){
      return res.status(400).json({error:"Uploaded files are invalid or too large"});
    }

    if(extraTenantData.leaseAgreementFile && extraTenantData.leaseAgreementFile.type !== "application/pdf"){
      return res.status(400).json({error:"Lease agreement must be a PDF"});
    }

    const moveInDateObj = parseFlexibleDateInput(req.body.moveInDate);
    const moveOutDateObj = parseFlexibleDateInput(req.body.moveOutDate);

    if(req.body.moveInDate && !moveInDateObj){
      return res.status(400).json({error:"Invalid move-in date"});
    }

    if(req.body.moveOutDate && !moveOutDateObj){
      return res.status(400).json({error:"Invalid move-out date"});
    }

    if(moveInDateObj && moveOutDateObj && moveOutDateObj < moveInDateObj){
      return res.status(400).json({error:"Move-out date cannot be before move-in date"});
    }

    const unitRecord = await Unit.findOne({ _id: unit, building });

    if(!unitRecord){
      return res.status(400).json({error:"Unit does not belong to this building"});
    }

    const existingTenant = await Tenant.findOne({
      building,
      tenantId: normalizedTenantId
    });

    if(existingTenant){
      return res.status(400).json({error:"tenant id exists"});
    }

    const occupiedUnit = await Tenant.findOne({ building, unit });

    if(occupiedUnit){
      return res.status(400).json({error:"Unit is already occupied"});
    }

    const tenant = await Tenant.create({
      building,
      tenantId: normalizedTenantId,
      tenantName: normalizedTenantName,
      phone: normalizedPhone,
      unit,
      ...extraTenantData
    });
    await recordAuditLog({
      building: tenant.building,
      action: "created",
      entityType: "tenant",
      entityId: tenant._id,
      entityLabel: tenant.tenantName,
      message: `Tenant ${tenant.tenantName} created`
    });
    res.json({message:"tenant added", tenant});
    
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

router.put('/tenants/:id', async (req,res) => {
  try {
    const {building, tenantId,tenantName,phone,unit} = req.body;
    const normalizedTenantId = Number(tenantId);
    const normalizedTenantName = String(tenantName || "").trim();
    const normalizedPhone = Number(phone);
    const extraTenantData = normalizeTenantPayload(req.body);

    if(!building || !tenantId || !normalizedTenantName || !phone || !unit){
      return res.status(400).json({error:"fields should not be empty"});
    }

    if(!Number.isFinite(normalizedTenantId) || !Number.isFinite(normalizedPhone)){
      return res.status(400).json({error:"Tenant ID and phone must be valid numbers"});
    }

    if(!isValidEmail(extraTenantData.email)){
      return res.status(400).json({error:"Invalid email format"});
    }

    if(!isValidFile(extraTenantData.idLicenseFile) || !isValidFile(extraTenantData.leaseAgreementFile)){
      return res.status(400).json({error:"Uploaded files are invalid or too large"});
    }

    if(extraTenantData.leaseAgreementFile && extraTenantData.leaseAgreementFile.type !== "application/pdf"){
      return res.status(400).json({error:"Lease agreement must be a PDF"});
    }

    const moveInDateObj = parseFlexibleDateInput(req.body.moveInDate);
    const moveOutDateObj = parseFlexibleDateInput(req.body.moveOutDate);

    if(req.body.moveInDate && !moveInDateObj){
      return res.status(400).json({error:"Invalid move-in date"});
    }

    if(req.body.moveOutDate && !moveOutDateObj){
      return res.status(400).json({error:"Invalid move-out date"});
    }

    if(moveInDateObj && moveOutDateObj && moveOutDateObj < moveInDateObj){
      return res.status(400).json({error:"Move-out date cannot be before move-in date"});
    }

    const unitRecord = await Unit.findOne({ _id: unit, building });

    if(!unitRecord){
      return res.status(400).json({error:"Unit does not belong to this building"});
    }

    const existingTenant = await Tenant.findOne({
      building,
      tenantId: normalizedTenantId,
      _id: { $ne: req.params.id }
    });

    if(existingTenant){
      return res.status(400).json({error:"tenant id exists"});
    }

    const occupiedUnit = await Tenant.findOne({
      building,
      unit,
      _id: { $ne: req.params.id }
    });

    if(occupiedUnit){
      return res.status(400).json({error:"Unit is already occupied"});
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      {
        building,
        tenantId: normalizedTenantId,
        tenantName: normalizedTenantName,
        phone: normalizedPhone,
        unit,
        ...extraTenantData
      },
      { returnDocument: "after" }
    );

    if(!tenant){
      return res.status(404).json({error:"tenant not found"});
    }

    await recordAuditLog({
      building: tenant.building,
      action: "updated",
      entityType: "tenant",
      entityId: tenant._id,
      entityLabel: tenant.tenantName,
      message: `Tenant ${tenant.tenantName} updated`
    });

    res.json({message:"tenant updated", tenant});
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

router.get('/tenants/:id/payment-history', async (req,res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);

    if(!tenant){
      return res.status(404).json({error:"tenant not found"});
    }

    const contracts = await Contract.find({ tenant: req.params.id }).sort({ createdAt: -1 });
    const utilities = await Utility.find({ tenant: req.params.id }).sort({ createdAt: -1 });
    const paymentRecords = await PaymentRecord.find({ tenant: req.params.id })
      .populate('invoice')
      .populate('contract')
      .sort({ paymentDate: -1 });

    const rentHistory = contracts.map((contract) => ({
      _id: contract._id,
      type: "Rent",
      date: contract.leaseStartDate || contract.date || contract.createdAt,
      amount: contract.amount || 0,
      status: contract.status || "pending",
      details: contract.paymentFrequency || "Rent payment"
    }));

    const utilityHistory = utilities.map((utility) => ({
      _id: utility._id,
      type: "Utility",
      date: utility.dueDate || utility.createdAt,
      amount:
        (Number(utility.waterAmount) || 0) +
        (Number(utility.lightAmount) || 0) +
        (Number(utility.generatorGasAmount) || 0),
      status: utility.status || "pending",
      details: "Water, light, generator gas"
    }));

    const paymentRecordHistory = paymentRecords.map((payment) => ({
      _id: payment._id,
      type: payment.invoice ? "Invoice Payment" : "Contract Payment",
      date: payment.paymentDate,
      amount: payment.amount || 0,
      status: "paid",
      details: payment.invoice?.invoiceNumber || payment.contract?.paymentFrequency || payment.reference || "Payment record"
    }));

    const paymentHistory = [...paymentRecordHistory, ...rentHistory, ...utilityHistory].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    res.json(paymentHistory);
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

router.delete('/tenants/:id', async (req,res) => {
  try {
    const [contractCount, utilityCount, invoiceCount, rentInvoiceCount, paymentCount] = await Promise.all([
      Contract.countDocuments({ tenant: req.params.id }),
      Utility.countDocuments({ tenant: req.params.id }),
      Invoice.countDocuments({ tenant: req.params.id }),
      RentInvoice.countDocuments({ tenant: req.params.id }),
      PaymentRecord.countDocuments({ tenant: req.params.id })
    ]);

    if (contractCount || utilityCount || invoiceCount || rentInvoiceCount || paymentCount) {
      return res.status(400).json({
        error: "Cannot delete this tenant because contracts, invoices, utilities, or payment records still use it. Delete or close those records first."
      });
    }

    const tenant = await Tenant.findByIdAndDelete(req.params.id);

    if(!tenant){
      return res.status(404).json({error:"tenant not found"});
    }

    await recordAuditLog({
      building: tenant.building,
      action: "deleted",
      entityType: "tenant",
      entityId: tenant._id,
      entityLabel: tenant.tenantName,
      message: `Tenant ${tenant.tenantName} deleted`
    });

    res.json({message:"tenant removed"});
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});

module.exports = router;
