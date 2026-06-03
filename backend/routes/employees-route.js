const express = require('express');
const router = express.Router();
const Employee = require('../models/employees-model');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  ETHIOPIAN_PHONE_ERROR,
  normalizeEthiopianPhone
} = require('../utils/phone-utils');

// Employee routes support payroll/reporting. Normalizing input here keeps payroll exports clean.

// Convert raw form values into the exact shape the database expects.
const normalizeEmployeePayload = (body) => {
  // Salary is stored as gross monthly salary; payroll later calculates deductions from it.
  const salary = Number(body.salary || 0);

  return {
    building: body.building,
    name: String(body.name || "").trim(),
    position: String(body.position || "").trim(),
    phoneNumber: normalizeEthiopianPhone(body.phoneNumber, { required: false }),
    email: String(body.email || "").trim().toLowerCase(),
    salary: Number.isFinite(salary) ? salary : NaN,
    emergencyContactName: String(body.emergencyContactName || "").trim(),
    emergencyContactPhone: normalizeEthiopianPhone(body.emergencyContactPhone, { required: false })
  };
};

const isValidEmail = (email) => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

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
       let employeeData;

       try {
        employeeData = normalizeEmployeePayload(req.body);
       } catch {
        return res.status(400).json({error: ETHIOPIAN_PHONE_ERROR});
       }

       if(!employeeData.building || !employeeData.name || !employeeData.position){
        return res.status(400).json({error:"Please fill in all fields"});
       }

       if(!isValidEmail(employeeData.email)){
        return res.status(400).json({error:"Invalid email format"});
       }

       if(!Number.isFinite(employeeData.salary) || employeeData.salary < 0){
        return res.status(400).json({error:"Gross salary must be a valid number"});
       }

       // Avoid accidental duplicates when the same person is entered twice in one building.
       const existingEmployee = await Employee.findOne({
        building: employeeData.building,
        name: employeeData.name,
        position: employeeData.position,
        phoneNumber: employeeData.phoneNumber
       }).collation({ locale: "en", strength: 2 });

       if(existingEmployee){
        return res.status(400).json({error:"employee already exists"});
       }

       const employee = await Employee.create(employeeData);
       await recordAuditLog({
        building: employee.building,
        action: "created",
        entityType: "employee",
        entityId: employee._id,
        entityLabel: employee.name,
        message: `Employee ${employee.name} created`
       });
       res.json({message:"employee created", employee})
  }catch(err){
    res.status(500).json({err:err.message});
  }
  

});

router.put('/employees/:id', async (req,res) => {
  try {
    let employeeData;

    try {
      employeeData = normalizeEmployeePayload(req.body);
    } catch {
      return res.status(400).json({error: ETHIOPIAN_PHONE_ERROR});
    }

    if(!employeeData.building || !employeeData.name || !employeeData.position){
      return res.status(400).json({error:"Please fill in all fields"});
    }

    if(!isValidEmail(employeeData.email)){
      return res.status(400).json({error:"Invalid email format"});
    }

    if(!Number.isFinite(employeeData.salary) || employeeData.salary < 0){
      return res.status(400).json({error:"Gross salary must be a valid number"});
    }

    // Same duplicate check as create, excluding the employee being edited.
    const existingEmployee = await Employee.findOne({
      building: employeeData.building,
      name: employeeData.name,
      position: employeeData.position,
      phoneNumber: employeeData.phoneNumber,
      _id: { $ne: req.params.id }
    }).collation({ locale: "en", strength: 2 });

    if(existingEmployee){
      return res.status(400).json({error:"employee already exists"});
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      employeeData,
      { returnDocument: "after" }
    );

    if(!employee){
      return res.status(404).json({err:"employee not found"});
    }

    await recordAuditLog({
      building: employee.building,
      action: "updated",
      entityType: "employee",
      entityId: employee._id,
      entityLabel: employee.name,
      message: `Employee ${employee.name} updated`
    });

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

    await recordAuditLog({
      building: employee.building,
      action: "deleted",
      entityType: "employee",
      entityId: employee._id,
      entityLabel: employee.name,
      message: `Employee ${employee.name} deleted`
    });

    res.json({message:"employee deleted"});
  } catch (err) {
    res.status(500).json({err:err.message});
  }
})

module.exports = router;
