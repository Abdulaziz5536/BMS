export const TAX_BRACKETS = [
  { min: 0, max: 2000, rate: 0, deduction: 0 },
  { min: 2000, max: 4000, rate: 0.15, deduction: 300 },
  { min: 4000, max: 7000, rate: 0.20, deduction: 500 },
  { min: 7000, max: 10000, rate: 0.25, deduction: 850 },
  { min: 10000, max: 14000, rate: 0.30, deduction: 1350 },
  { min: 14000, max: Infinity, rate: 0.35, deduction: 2050 }
];

export const EMPLOYEE_PENSION_RATE = 0.07;
export const EMPLOYER_PENSION_RATE = 0.11;

const roundMoney = (amount) => Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;

export const calculateIncomeTax = (salary) => {
  // Ethiopian payroll-style bracket calculation using gross salary and deduction amounts.
  const grossSalary = Math.max(0, Number(salary) || 0);
  const bracket = TAX_BRACKETS.find((item) => grossSalary > item.min && grossSalary <= item.max) || TAX_BRACKETS[0];
  const tax = Math.max(0, grossSalary * bracket.rate - bracket.deduction);
  return roundMoney(tax);
};

export const calculatePayrollRow = (employee) => {
  // Employee salary is stored as gross pay; payroll deductions are calculated from that amount.
  const grossSalary = roundMoney(Math.max(0, Number(employee?.salary) || 0));
  const employeePension = roundMoney(grossSalary * EMPLOYEE_PENSION_RATE);
  const employerPension = roundMoney(grossSalary * EMPLOYER_PENSION_RATE);
  const incomeTax = calculateIncomeTax(grossSalary);
  const netPay = roundMoney(grossSalary - employeePension - incomeTax);
  const governmentRemittance = roundMoney(employeePension + employerPension + incomeTax);

  return {
    employee,
    grossSalary,
    employeePension,
    employerPension,
    incomeTax,
    netPay,
    governmentRemittance
  };
};

export const calculatePayrollTotals = (rows) =>
  rows.reduce((totals, row) => ({
    grossSalary: roundMoney(totals.grossSalary + row.grossSalary),
    employeePension: roundMoney(totals.employeePension + row.employeePension),
    employerPension: roundMoney(totals.employerPension + row.employerPension),
    incomeTax: roundMoney(totals.incomeTax + row.incomeTax),
    netPay: roundMoney(totals.netPay + row.netPay),
    governmentRemittance: roundMoney(totals.governmentRemittance + row.governmentRemittance)
  }), {
    grossSalary: 0,
    employeePension: 0,
    employerPension: 0,
    incomeTax: 0,
    netPay: 0,
    governmentRemittance: 0
  });
