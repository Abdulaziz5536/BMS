const express = require('express');
const router = express.Router();
const Tenant = require('../models/tenant-model');
const Unit = require('../models/unit-model');
const Contract = require('../models/contract-model');
const Invoice = require('../models/invoice-model');
const PaymentRecord = require('../models/payment-record-model');
const Utility = require('../models/utility-model');
const { recordAuditLog } = require('../services/audit-log-service');
const { ensureRecordMatchesRequestedBuilding } = require('../utils/building-scope-utils');
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput
} = require('../utils/date-utils');
const {
  ETHIOPIAN_PHONE_ERROR,
  normalizeEthiopianPhone
} = require('../utils/phone-utils');
const { normalizePaymentFrequency } = require('../utils/payment-frequency-utils');
const {
  normalizeCaseInsensitiveValue,
  withCaseInsensitiveCollation
} = require('../utils/case-insensitive-utils');

const MAX_FILE_DATA_LENGTH = 7000000;

// Tenants connect people to units and become the parent for contracts,
// invoices, utilities, payment history, and reminder delivery.

// Normalize optional contact/date/file fields before validation and saving.
const normalizeTenantPayload = (body) => ({
  email: normalizeCaseInsensitiveValue(body.email),
  // Tenant TIN is optional, but when present it prints on receipts.
  tinNumber: String(body.tinNumber || "").trim(),
  emergencyContactName: String(body.emergencyContactName || "").trim(),
  emergencyContactPhone: normalizeEthiopianPhone(body.emergencyContactPhone, { required: false }),
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
    let normalizedPhone;
    let extraTenantData;

    if(!building || !tenantId || !normalizedTenantName || !unit){
      return res.status(400).json({error:"fields should not be empty"});
    }

    try {
      normalizedPhone = normalizeEthiopianPhone(phone, { required: false });
      extraTenantData = normalizeTenantPayload(req.body);
    } catch {
      return res.status(400).json({error: ETHIOPIAN_PHONE_ERROR});
    }

    if(!Number.isFinite(normalizedTenantId)){
      return res.status(400).json({error:"Tenant ID must be a valid number"});
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

    // Prevent assigning a tenant to a unit from another building.
    const unitRecord = await Unit.findOne({ _id: unit, building });

    if(!unitRecord){
      return res.status(400).json({error:"Unit does not belong to this building"});
    }

    // Tenant IDs are unique only within a building.
    const existingTenant = await Tenant.findOne({
      building,
      tenantId: normalizedTenantId
    });

    if(existingTenant){
      return res.status(400).json({error:"tenant id exists"});
    }

    if(extraTenantData.email){
      const existingEmail = await withCaseInsensitiveCollation(Tenant.findOne({
        building,
        email: extraTenantData.email
      }));

      if(existingEmail){
        return res.status(400).json({error:"tenant email exists"});
      }
    }

    // One active tenant per unit keeps occupancy calculations correct.
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
    let normalizedPhone;
    let extraTenantData;

    if(!building || !tenantId || !normalizedTenantName || !unit){
      return res.status(400).json({error:"fields should not be empty"});
    }

    try {
      normalizedPhone = normalizeEthiopianPhone(phone, { required: false });
      extraTenantData = normalizeTenantPayload(req.body);
    } catch {
      return res.status(400).json({error: ETHIOPIAN_PHONE_ERROR});
    }

    if(!Number.isFinite(normalizedTenantId)){
      return res.status(400).json({error:"Tenant ID must be a valid number"});
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

    const currentTenant = await Tenant.findById(req.params.id);

    if(!currentTenant){
      return res.status(404).json({error:"tenant not found"});
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, currentTenant, "Tenant")) {
      return;
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

    if(extraTenantData.email){
      const existingEmail = await withCaseInsensitiveCollation(Tenant.findOne({
        building,
        email: extraTenantData.email,
        _id: { $ne: req.params.id }
      }));

      if(existingEmail){
        return res.status(400).json({error:"tenant email exists"});
      }
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

    if (!ensureRecordMatchesRequestedBuilding(req, res, tenant, "Tenant")) {
      return;
    }

    // History merges contracts, utilities, and actual payment records into one timeline for the UI.
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
      details: normalizePaymentFrequency(contract.paymentFrequency) || "Rent payment"
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
      details: payment.invoice?.invoiceNumber || normalizePaymentFrequency(payment.contract?.paymentFrequency) || payment.reference || "Payment record"
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
    const tenant = await Tenant.findById(req.params.id);

    if(!tenant){
      return res.status(404).json({error:"tenant not found"});
    }

    if (!ensureRecordMatchesRequestedBuilding(req, res, tenant, "Tenant")) {
      return;
    }

    // Deletion is blocked while financial records still reference the tenant.
    const [contractCount, utilityCount, invoiceCount, paymentCount] = await Promise.all([
      Contract.countDocuments({ tenant: req.params.id }),
      Utility.countDocuments({ tenant: req.params.id }),
      Invoice.countDocuments({ tenant: req.params.id }),
      PaymentRecord.countDocuments({ tenant: req.params.id })
    ]);

    if (contractCount || utilityCount || invoiceCount || paymentCount) {
      return res.status(400).json({
        error: "Cannot delete this tenant because contracts, invoices, utilities, or payment records still use it. Delete or close those records first."
      });
    }

    await Tenant.deleteOne({ _id: tenant._id });

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
