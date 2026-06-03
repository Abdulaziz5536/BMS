import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  PencilSquareIcon,
  PrinterIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import Sidebar from "./Sidebar";
import { confirmAction } from "../components/confirmAction";
import {
  API_BASE,
  apiFetch,
  invalidateCache,
  loadCachedJson,
  readResponse,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import useSelectedBuildingName from "../hooks/useSelectedBuildingName";
import useShortError from "../hooks/useShortError";
import { compareSortValues, nextSortDirection } from "../utils/sortUtils";
import {
  ETHIOPIAN_PHONE_ERROR,
  formatEthiopianPhoneDisplay,
  formatEthiopianPhoneInput,
  isValidEthiopianPhone,
  normalizeEthiopianPhone,
  phoneInputProps
} from "../utils/phoneUtils";
import {
  calculatePayrollRow,
  calculatePayrollTotals
} from "../utils/payrollUtils";
import { gregorianToEthiopian } from "../utils/dateUtils";
import "../style.css";

// Employees page manages staff records and generates a payroll report for the selected building.

const formatCurrency = (amount) => `Br ${Number(amount || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatPayrollAmount = (amount) => Number(amount || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const currentPayrollMonth = () => new Date().toISOString().slice(0, 7);

const ETHIOPIAN_MONTH_NAMES = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume"
];

const formatPayrollMonth = (value) => {
  if (!value) return "-";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric"
  });
};

const formatPayrollSheetMonth = (value) => {
  if (!value) return "-";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;

  const gregorianMonth = new Date(year, month - 1, 1).toLocaleDateString([], {
    month: "long"
  });
  const ethiopianDate = gregorianToEthiopian(new Date(Date.UTC(year, month - 1, 15)));
  const ethiopianMonth = ETHIOPIAN_MONTH_NAMES[(ethiopianDate?.month || 1) - 1] || "";
  const ethiopianLabel = ethiopianDate ? `${ethiopianMonth}, ${ethiopianDate.year}` : "";
  const gregorianLabel = `${gregorianMonth}, ${year}`;

  return ethiopianLabel ? `${ethiopianLabel} (${gregorianLabel})` : gregorianLabel;
};

export default function Employees() {
  const selectedBuildingId = useSelectedBuilding();
  const buildingName = useSelectedBuildingName();
  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [salary, setSalary] = useState("");
  const [transportAllowance, setTransportAllowance] = useState("");
  const [loan, setLoan] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [selectedPayrollEmployeeIds, setSelectedPayrollEmployeeIds] = useState([]);
  const [payrollSelectionTouched, setPayrollSelectionTouched] = useState(false);
  const [payrollSelectorOpen, setPayrollSelectorOpen] = useState(false);
  const [payrollEmployeeSearch, setPayrollEmployeeSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const employeeFormRef = useRef(null);
  const payrollDropdownRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useShortError();
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  const clearForm = useCallback(() => {
    setName("");
    setPosition("");
    setPhoneNumber("");
    setEmail("");
    setSalary("");
    setTransportAllowance("");
    setLoan("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setEditingId(null);
  }, []);

  const allEmployeeIds = useMemo(() => employees.map((employee) => String(employee._id)), [employees]);

  const selectedPayrollEmployeeSet = useMemo(
    () => new Set(selectedPayrollEmployeeIds),
    [selectedPayrollEmployeeIds]
  );

  const selectedPayrollEmployees = useMemo(() => employees.filter((employee) =>
    selectedPayrollEmployeeSet.has(String(employee._id))
  ), [employees, selectedPayrollEmployeeSet]);

  const payrollSelectionEmployees = useMemo(() => [...employees].sort((a, b) =>
    compareSortValues(a.name, b.name, "asc")
  ), [employees]);

  const filteredPayrollSelectionEmployees = useMemo(() => {
    const searchValue = payrollEmployeeSearch.trim().toLowerCase();

    if (!searchValue) {
      return payrollSelectionEmployees;
    }

    return payrollSelectionEmployees.filter((employee) =>
      [employee.name, employee.position, employee.phoneNumber, employee.email]
        .some((value) => String(value || "").toLowerCase().includes(searchValue))
    );
  }, [payrollEmployeeSearch, payrollSelectionEmployees]);

  const payrollRows = useMemo(() => selectedPayrollEmployees.map((employee) => (
    calculatePayrollRow(employee)
  )), [selectedPayrollEmployees]);

  const payrollTotals = useMemo(() => calculatePayrollTotals(payrollRows), [payrollRows]);

  const sortedEmployees = useMemo(() => [...employees].sort((a, b) =>
    compareSortValues(a[sortField], b[sortField], sortDirection)
  ), [employees, sortDirection, sortField]);

  const fetchEmployees = useCallback(async (useCache = true) => {
    // Employee list is cached per building to keep payroll screen fast.
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
  }, [selectedBuildingId, setError]);

  useEffect(() => {
    clearForm();
    setMessage("");
    setError("");
    setSelectedPayrollEmployeeIds([]);
    setPayrollSelectionTouched(false);
    setPayrollSelectorOpen(false);
    setPayrollEmployeeSearch("");
    fetchEmployees();
  }, [clearForm, fetchEmployees, selectedBuildingId, setError]);

  useEffect(() => {
    // Payroll defaults to all employees until the user chooses a smaller payroll group.
    setSelectedPayrollEmployeeIds((currentIds) => {
      if (!payrollSelectionTouched) {
        return allEmployeeIds;
      }

      const validIds = new Set(allEmployeeIds);
      return currentIds.filter((id) => validIds.has(id));
    });
  }, [allEmployeeIds, payrollSelectionTouched]);

  useEffect(() => {
    // Close the dropdown when the user clicks away or presses Escape.
    if (!payrollSelectorOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!payrollDropdownRef.current?.contains(event.target)) {
        setPayrollSelectorOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPayrollSelectorOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [payrollSelectorOpen]);

  useEffect(() => {
    if (editingId) {
      employeeFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [editingId]);

  const saveEmployee = async () => {
    // Phone/email/payroll validation runs before calling the backend.
    setMessage("");
    setError("");

    if (!selectedBuildingId) {
      setError("Add or select a building first");
      return;
    }

    if (!name || !position || salary === "") {
      setError("Please fill in all fields");
      return;
    }

    const salaryAmount = Number(salary);
    const transportAllowanceAmount = Number(transportAllowance || 0);
    const loanAmount = Number(loan || 0);

    if (
      !Number.isFinite(salaryAmount) ||
      !Number.isFinite(transportAllowanceAmount) ||
      !Number.isFinite(loanAmount) ||
      salaryAmount < 0 ||
      transportAllowanceAmount < 0 ||
      loanAmount < 0
    ) {
      setError("Payroll amounts must be valid numbers");
      return;
    }

    if (phoneNumber && !isValidEthiopianPhone(phoneNumber, { required: false })) {
      setError(ETHIOPIAN_PHONE_ERROR);
      return;
    }

    if (emergencyContactPhone && !isValidEthiopianPhone(emergencyContactPhone, { required: false })) {
      setError(ETHIOPIAN_PHONE_ERROR);
      return;
    }

    try {
      const normalizedPhone = normalizeEthiopianPhone(phoneNumber, { required: false });
      const normalizedEmergencyPhone = normalizeEthiopianPhone(emergencyContactPhone, { required: false });
      const res = await apiFetch(
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
            phoneNumber: normalizedPhone,
            email,
            salary: salaryAmount,
            transportAllowance: transportAllowanceAmount,
            loan: loanAmount,
            emergencyContactName,
            emergencyContactPhone: normalizedEmergencyPhone
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
    // Populate the form with display-friendly phone formatting.
    setName(employee.name || "");
    setPosition(employee.position || "");
    setPhoneNumber(formatEthiopianPhoneInput(employee.phoneNumber || ""));
    setEmail(employee.email || "");
    setSalary(employee.salary ?? "");
    setTransportAllowance(employee.transportAllowance ?? "");
    setLoan(employee.loan ?? "");
    setEmergencyContactName(employee.emergencyContactName || "");
    setEmergencyContactPhone(formatEthiopianPhoneInput(employee.emergencyContactPhone || ""));
    setEditingId(employee._id);
    setMessage("");
    setError("");
  };

  const printPayroll = () => {
    // CSS print rules turn the current payroll table into a formal report.
    window.print();
  };

  const deleteEmployee = async (id) => {
    // Employees are independent records, but deletion is still confirmed to prevent accidents.
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

      const res = await apiFetch(`${API_BASE}/employees/${id}`, {
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

  const handleSort = (field) => {
    setSortDirection(nextSortDirection(sortField, field, sortDirection));
    setSortField(field);
  };

  const togglePayrollEmployee = (employeeId) => {
    // Manual payroll selection lets one monthly report include all staff or only chosen employees.
    setPayrollSelectionTouched(true);
    setSelectedPayrollEmployeeIds((currentIds) =>
      currentIds.includes(employeeId)
        ? currentIds.filter((id) => id !== employeeId)
        : [...currentIds, employeeId]
    );
  };

  const selectAllPayrollEmployees = () => {
    setPayrollSelectionTouched(true);
    setSelectedPayrollEmployeeIds(allEmployeeIds);
  };

  const clearPayrollEmployeeSelection = () => {
    setPayrollSelectionTouched(true);
    setSelectedPayrollEmployeeIds([]);
  };

  const payrollMonthLabel = formatPayrollMonth(payrollMonth);
  const payrollSheetMonthLabel = formatPayrollSheetMonth(payrollMonth);
  const payrollAccountingDebitTotal = payrollTotals.basicSalary
    + payrollTotals.transportAllowance
    + payrollTotals.employerPension;
  const payrollAccountingCreditTotal = payrollTotals.incomeTax
    + payrollTotals.employeePension
    + payrollTotals.employerPension
    + payrollTotals.netPay;
  const allPayrollEmployeesSelected = employees.length > 0 && selectedPayrollEmployees.length === employees.length;
  const payrollSelectionLabel = employees.length === 0
    ? "No employees"
    : allPayrollEmployeesSelected
      ? `All employees (${employees.length})`
      : selectedPayrollEmployees.length === 0
        ? "Choose employees"
        : `${selectedPayrollEmployees.length} selected`;

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
              {...phoneInputProps}
              placeholder="Phone Number (+2519XXXXXXXX)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(formatEthiopianPhoneInput(e.target.value))}
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
              placeholder="Basic Salary (Br)"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="number"
              min="0"
              placeholder="Transport Allowance (Br)"
              value={transportAllowance}
              onChange={(e) => setTransportAllowance(e.target.value)}
              disabled={!selectedBuildingId}
            />

            <input
              type="number"
              min="0"
              placeholder="Loan (Br)"
              value={loan}
              onChange={(e) => setLoan(e.target.value)}
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
              {...phoneInputProps}
              placeholder="Emergency Contact Phone (+2519XXXXXXXX)"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(formatEthiopianPhoneInput(e.target.value))}
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
              <th onClick={() => handleSort("name")} className="sortable-header">
                Name {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("position")} className="sortable-header">
                Position {sortField === "position" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("phoneNumber")} className="sortable-header">
                Phone Number {sortField === "phoneNumber" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("email")} className="sortable-header">
                Email {sortField === "email" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("salary")} className="sortable-header">
                Basic Salary {sortField === "salary" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("transportAllowance")} className="sortable-header">
                Transport Allowance {sortField === "transportAllowance" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("loan")} className="sortable-header">
                Loan {sortField === "loan" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th onClick={() => handleSort("emergencyContactName")} className="sortable-header">
                Emergency Contact {sortField === "emergencyContactName" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedEmployees.length > 0 ? (
              sortedEmployees.map((employee) => (
                <tr key={employee._id}>
                  <td>{employee.name}</td>
                  <td>{employee.position}</td>
                  <td>{formatEthiopianPhoneDisplay(employee.phoneNumber) || "-"}</td>
                  <td>{employee.email || "-"}</td>
                  <td>{formatCurrency(employee.salary)}</td>
                  <td>{formatCurrency(employee.transportAllowance)}</td>
                  <td>{formatCurrency(employee.loan)}</td>
                  <td>
                    {employee.emergencyContactName || employee.emergencyContactPhone
                      ? `${employee.emergencyContactName || "-"} / ${formatEthiopianPhoneDisplay(employee.emergencyContactPhone) || "-"}`
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
                <td colSpan="9">No employees added yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <section className="panel payroll-panel">
          <div className="section-header">
            <div>
              <h2>Payroll Generator</h2>
              <p>{payrollRows.length} employee{payrollRows.length === 1 ? "" : "s"} included for {payrollMonthLabel}.</p>
            </div>
            <div className="payroll-actions">
              <input
                type="month"
                aria-label="Payroll month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
              />
              <button onClick={printPayroll} disabled={payrollRows.length === 0}>
                <PrinterIcon />
                Print / Save PDF
              </button>
            </div>
          </div>

          <div className="payroll-selection-panel" ref={payrollDropdownRef}>
            <div className="payroll-selection-header">
              <div>
                <span>Employees</span>
                <strong>{selectedPayrollEmployees.length} of {employees.length} selected</strong>
              </div>
              <button
                type="button"
                className={`payroll-select-trigger ${payrollSelectorOpen ? "is-open" : ""}`}
                onClick={() => setPayrollSelectorOpen((isOpen) => !isOpen)}
                disabled={employees.length === 0}
                aria-expanded={payrollSelectorOpen}
                aria-haspopup="listbox"
              >
                <span>{payrollSelectionLabel}</span>
                <ChevronDownIcon />
              </button>
            </div>

            {payrollSelectorOpen && (
              <div className="payroll-selection-popover">
                <div className="payroll-selection-tools">
                  <input
                    type="search"
                    placeholder="Search employees"
                    value={payrollEmployeeSearch}
                    onChange={(e) => setPayrollEmployeeSearch(e.target.value)}
                  />
                  <div className="payroll-selection-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={selectAllPayrollEmployees}
                      disabled={employees.length === 0 || selectedPayrollEmployees.length === employees.length}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={clearPayrollEmployeeSelection}
                      disabled={selectedPayrollEmployees.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="payroll-employee-selector" role="listbox" aria-label="Payroll employees">
                  {filteredPayrollSelectionEmployees.length > 0 ? (
                    filteredPayrollSelectionEmployees.map((employee) => {
                      const employeeId = String(employee._id);
                      const payrollPreviewAmount = (Number(employee.salary) || 0)
                        + (Number(employee.transportAllowance) || 0);

                      return (
                        <label className="payroll-employee-option" key={employee._id}>
                          <input
                            type="checkbox"
                            checked={selectedPayrollEmployeeSet.has(employeeId)}
                            onChange={() => togglePayrollEmployee(employeeId)}
                          />
                          <span>
                            <strong>{employee.name}</strong>
                            <small>{employee.position || "Employee"} - {formatCurrency(payrollPreviewAmount)}</small>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="empty-state compact">No employees match this search.</p>
                  )}
                </div>
              </div>
            )}
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
            <div className="payroll-document-header">
              <h2>{buildingName}</h2>
              <p>Payroll Sheet for the month {payrollSheetMonthLabel}</p>
            </div>

            <table className="floors-table payroll-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Employee Name</th>
                  <th>Basic Salary</th>
                  <th>Transport Allowance</th>
                  <th>Taxable Income</th>
                  <th>Gross Salary</th>
                  <th>Pension 7% By the employee</th>
                  <th>Pension 11% by the employer</th>
                  <th>Income Tax</th>
                  <th>Loan</th>
                  <th>Total Deduct</th>
                  <th>Net Pay</th>
                  <th>Signiture</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.length > 0 ? (
                  payrollRows.map((row, index) => (
                    <tr key={row.employee._id}>
                      <td>{index + 1}</td>
                      <td>{row.employee.name}</td>
                      <td>{formatPayrollAmount(row.basicSalary)}</td>
                      <td>{formatPayrollAmount(row.transportAllowance)}</td>
                      <td>{formatPayrollAmount(row.taxableIncome)}</td>
                      <td>{formatPayrollAmount(row.grossSalary)}</td>
                      <td>{formatPayrollAmount(row.employeePension)}</td>
                      <td>{formatPayrollAmount(row.employerPension)}</td>
                      <td>{formatPayrollAmount(row.incomeTax)}</td>
                      <td>{formatPayrollAmount(row.loan)}</td>
                      <td>{formatPayrollAmount(row.totalDeduct)}</td>
                      <td>{formatPayrollAmount(row.netPay)}</td>
                      <td></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="13">No employees available for payroll.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th></th>
                  <th>Totals</th>
                  <th>{formatPayrollAmount(payrollTotals.basicSalary)}</th>
                  <th>{formatPayrollAmount(payrollTotals.transportAllowance)}</th>
                  <th>{formatPayrollAmount(payrollTotals.taxableIncome)}</th>
                  <th>{formatPayrollAmount(payrollTotals.grossSalary)}</th>
                  <th>{formatPayrollAmount(payrollTotals.employeePension)}</th>
                  <th>{formatPayrollAmount(payrollTotals.employerPension)}</th>
                  <th>{formatPayrollAmount(payrollTotals.incomeTax)}</th>
                  <th>{formatPayrollAmount(payrollTotals.loan)}</th>
                  <th>{formatPayrollAmount(payrollTotals.totalDeduct)}</th>
                  <th>{formatPayrollAmount(payrollTotals.netPay)}</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>

            <div className="payroll-signature-grid">
              <div>
                <span>Prepared by</span>
              </div>
              <div>
                <span>Approved By</span>
              </div>
            </div>

            <table className="payroll-accounting-summary" aria-label="Payroll accounting summary">
              <tbody>
                <tr>
                  <td>Salary Expense</td>
                  <td>{formatPayrollAmount(payrollTotals.basicSalary)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Transport Allowance</td>
                  <td>{formatPayrollAmount(payrollTotals.transportAllowance)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Pension Expense</td>
                  <td>{formatPayrollAmount(payrollTotals.employerPension)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Position Allowance</td>
                  <td>-</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Income Payable Tax</td>
                  <td></td>
                  <td>{formatPayrollAmount(payrollTotals.incomeTax)}</td>
                </tr>
                <tr>
                  <td>Pension Payable</td>
                  <td></td>
                  <td>{formatPayrollAmount(payrollTotals.employeePension + payrollTotals.employerPension)}</td>
                </tr>
                <tr>
                  <td>Net Pay</td>
                  <td></td>
                  <td>{formatPayrollAmount(payrollTotals.netPay)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th></th>
                  <th>{formatPayrollAmount(payrollAccountingDebitTotal)}</th>
                  <th>{formatPayrollAmount(payrollAccountingCreditTotal)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
