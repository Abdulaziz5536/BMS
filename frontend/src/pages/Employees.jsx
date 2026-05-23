import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PencilSquareIcon,
  PrinterIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import { confirmAction } from "../components/confirmAction";
import {
  API_BASE,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import "../style.css";

const TAX_BRACKETS = [
  { min: 0, max: 2000, rate: 0, deduction: 0 },
  { min: 2000, max: 4000, rate: 0.15, deduction: 300 },
  { min: 4000, max: 7000, rate: 0.20, deduction: 500 },
  { min: 7000, max: 10000, rate: 0.25, deduction: 850 },
  { min: 10000, max: 14000, rate: 0.30, deduction: 1350 },
  { min: 14000, max: Infinity, rate: 0.35, deduction: 2050 }
];

const EMPLOYEE_PENSION_RATE = 0.07;
const EMPLOYER_PENSION_RATE = 0.11;

const formatCurrency = (amount) => `Br ${Number(amount || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const currentPayrollMonth = () => new Date().toISOString().slice(0, 7);

const calculateIncomeTax = (salary) => {
  const grossSalary = Math.max(0, Number(salary) || 0);
  const bracket = TAX_BRACKETS.find((item) => grossSalary > item.min && grossSalary <= item.max) || TAX_BRACKETS[0];
  const tax = Math.max(0, grossSalary * bracket.rate - bracket.deduction);
  return Number(tax.toFixed(2));
};

export default function Employees() {
  const selectedBuildingId = useSelectedBuilding();
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [salary, setSalary] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [editingId, setEditingId] = useState(null);
  const employeeFormRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearForm = useCallback(() => {
    setName("");
    setPosition("");
    setPhoneNumber("");
    setEmail("");
    setSalary("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setEditingId(null);
  }, []);

  const payrollRows = useMemo(() => employees.map((employee) => {
    const grossSalary = Number(employee.salary || 0);
    const employeePension = Number((grossSalary * EMPLOYEE_PENSION_RATE).toFixed(2));
    const employerPension = Number((grossSalary * EMPLOYER_PENSION_RATE).toFixed(2));
    const incomeTax = calculateIncomeTax(grossSalary);
    const netPay = Number((grossSalary - employeePension - incomeTax).toFixed(2));
    const governmentRemittance = Number((employeePension + employerPension + incomeTax).toFixed(2));

    return {
      employee,
      grossSalary,
      employeePension,
      employerPension,
      incomeTax,
      netPay,
      governmentRemittance
    };
  }), [employees]);

  const payrollTotals = useMemo(() => payrollRows.reduce((totals, row) => ({
    grossSalary: totals.grossSalary + row.grossSalary,
    employeePension: totals.employeePension + row.employeePension,
    employerPension: totals.employerPension + row.employerPension,
    incomeTax: totals.incomeTax + row.incomeTax,
    netPay: totals.netPay + row.netPay,
    governmentRemittance: totals.governmentRemittance + row.governmentRemittance
  }), {
    grossSalary: 0,
    employeePension: 0,
    employerPension: 0,
    incomeTax: 0,
    netPay: 0,
    governmentRemittance: 0
  }), [payrollRows]);

  const fetchEmployees = useCallback(async (useCache = true) => {
    if (!selectedBuildingId) {
      setEmployees([]);
      return;
    }

    await loadCachedJson(
      withBuilding("/employees", selectedBuildingId),
      setEmployees,
      setError,
      "Failed to load employees",
      { useCache }
    );
  }, [selectedBuildingId]);

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    fetchEmployees();
  }, [clearForm, fetchEmployees, selectedBuildingId]);

  useEffect(() => {
    if (editingId) {
      employeeFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const saveEmployee = async () => {
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!name || !position || !phoneNumber || salary === "") {
      setError("Please fill in all fields");
      return;
    }

    try {
      const res = await fetch(
        editingId ? `${API_BASE}/employees/${editingId}` : `${API_BASE}/employees`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            building: selectedBuildingId,
            name,
            position,
            phoneNumber,
            email,
            salary: Number(salary),
            emergencyContactName,
            emergencyContactPhone
          })
        }
      );

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || (editingId ? "Employee updated" : "Employee added"));
        clearForm();
        invalidateCache(selectedBuildingId);
        fetchEmployees(false);
      } else {
        setError(data.error || data.err || "Failed to save employee");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const editEmployee = (employee) => {
    setName(employee.name || "");
    setPosition(employee.position || "");
    setPhoneNumber(employee.phoneNumber || "");
    setEmail(employee.email || "");
    setSalary(employee.salary ?? "");
    setEmergencyContactName(employee.emergencyContactName || "");
    setEmergencyContactPhone(employee.emergencyContactPhone || "");
    setEditingId(employee._id);
    setMessage("");
    setError("");
  };

  const printPayroll = () => {
    window.print();
  };

  const deleteEmployee = async (id) => {
    const shouldDelete = await confirmAction({
      title: "Delete employee?",
      message: "Are you sure you want to delete this employee?",
      confirmText: "Yes",
      cancelText: "No"
    });

    if (!shouldDelete) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const res = await fetch(`${API_BASE}/employees/${id}`, {
        method: "DELETE"
      });

      const data = await readResponse(res);

      if (res.ok) {
        setMessage(data.message || "Employee deleted");
        invalidateCache(selectedBuildingId);
        fetchEmployees(false);
      } else {
        setError(data.error || data.err || "Failed to delete employee");
      }
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <h1>Employees</h1>

        {!selectedBuildingId && (
          <p className="error">Add or select a building before managing employees.</p>
        )}

        <section className="panel" ref={employeeFormRef}>
          <h2>{editingId ? "Edit Employee" : "Add Employee"}</h2>

          <div className="form-grid">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="text"
              placeholder="Position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="tel"
              placeholder="Phone Number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="number"
              min="0"
              placeholder="Monthly Salary (Br)"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="text"
              placeholder="Emergency Contact Name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="tel"
              placeholder="Emergency Contact Phone"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              disabled={!selectedBuildingId}
            />
          </div>

          <div className="form-actions">
            <button onClick={saveEmployee} disabled={!selectedBuildingId}>
              {editingId ? "Update Employee" : "Add Employee"}
            </button>

            {editingId && (
              <button className="secondary-btn" onClick={clearForm}>
                Cancel
              </button>
            )}
          </div>
        </section>

        {message && <p className="message">{message}</p>}
        {error && <p className="error">{error}</p>}

        <h2>Employees List</h2>

        <div className="floors-table-wrapper employee-table-wrapper">
        <table className="floors-table employee-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Position</th>
              <th>Phone Number</th>
              <th>Email</th>
              <th>Salary</th>
              <th>Emergency Contact</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {employees.length > 0 ? (
              employees.map((employee) => (
                <tr key={employee._id}>
                  <td>{employee.name}</td>
                  <td>{employee.position}</td>
                  <td>{employee.phoneNumber || "-"}</td>
                  <td>{employee.email || "-"}</td>
                  <td>{formatCurrency(employee.salary)}</td>
                  <td>
                    {employee.emergencyContactName || employee.emergencyContactPhone
                      ? `${employee.emergencyContactName || "-"} / ${employee.emergencyContactPhone || "-"}`
                      : "-"}
                  </td>
                  <td>
                    <div className="table-action-stack">
                      <div className="table-action-row">
                        <button className="table-action-btn" onClick={() => editEmployee(employee)} title="Edit">
                          <PencilSquareIcon />
                        </button>
                        <button className="table-action-btn danger-btn" onClick={() => deleteEmployee(employee._id)} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">No employees added yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <section className="panel payroll-panel">
          <div className="section-header">
            <div>
              <h2>Payroll Generator</h2>
              <p>Monthly PAYE, 7% employee pension, 11% employer pension, net pay, and government remittance summary.</p>
            </div>
            <div className="payroll-actions">
              <input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
              />
              <button onClick={printPayroll}>
                <PrinterIcon />
                Print / Save PDF
              </button>
            </div>
          </div>

          <div className="payroll-summary-grid">
            <div>
              <span>Gross payroll</span>
              <strong>{formatCurrency(payrollTotals.grossSalary)}</strong>
            </div>
            <div>
              <span>PAYE tax</span>
              <strong>{formatCurrency(payrollTotals.incomeTax)}</strong>
            </div>
            <div>
              <span>Employee pension</span>
              <strong>{formatCurrency(payrollTotals.employeePension)}</strong>
            </div>
            <div>
              <span>Employer pension</span>
              <strong>{formatCurrency(payrollTotals.employerPension)}</strong>
            </div>
            <div>
              <span>Net pay</span>
              <strong>{formatCurrency(payrollTotals.netPay)}</strong>
            </div>
            <div>
              <span>Government remittance</span>
              <strong>{formatCurrency(payrollTotals.governmentRemittance)}</strong>
            </div>
          </div>

          <div className="floors-table-wrapper payroll-report">
            <div className="payroll-print-heading">
              <h2>BHA MALL Payroll</h2>
              <p>Payroll month: {payrollMonth || "-"}</p>
            </div>
            <table className="floors-table payroll-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Position</th>
                  <th>Gross</th>
                  <th>PAYE</th>
                  <th>Emp. Pension 7%</th>
                  <th>Employer Pension 11%</th>
                  <th>Net Pay</th>
                  <th>Gov. Remittance</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.length > 0 ? (
                  payrollRows.map((row) => (
                    <tr key={row.employee._id}>
                      <td>{row.employee.name}</td>
                      <td>{row.employee.position || "-"}</td>
                      <td>{formatCurrency(row.grossSalary)}</td>
                      <td>{formatCurrency(row.incomeTax)}</td>
                      <td>{formatCurrency(row.employeePension)}</td>
                      <td>{formatCurrency(row.employerPension)}</td>
                      <td>{formatCurrency(row.netPay)}</td>
                      <td>{formatCurrency(row.governmentRemittance)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8">No employees available for payroll.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan="2">Totals</th>
                  <th>{formatCurrency(payrollTotals.grossSalary)}</th>
                  <th>{formatCurrency(payrollTotals.incomeTax)}</th>
                  <th>{formatCurrency(payrollTotals.employeePension)}</th>
                  <th>{formatCurrency(payrollTotals.employerPension)}</th>
                  <th>{formatCurrency(payrollTotals.netPay)}</th>
                  <th>{formatCurrency(payrollTotals.governmentRemittance)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
