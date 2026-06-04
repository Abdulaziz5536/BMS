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
  // Ethiopian payroll-style bracket calculation using taxable income and deduction amounts.
  const taxableIncome = Math.max(0, Number(salary) || 0);
  const bracket = TAX_BRACKETS.find((item) => taxableIncome > item.min && taxableIncome <= item.max) || TAX_BRACKETS[0];
  const tax = Math.max(0, taxableIncome * bracket.rate - bracket.deduction);
  return roundMoney(tax);
};

export const calculatePayrollRow = (employee) => {
  // Existing employee records store one salary value, so it is used as basic salary.
  const basicSalary = roundMoney(Math.max(0, Number(employee?.basicSalary ?? employee?.salary) || 0));
  const transportAllowance = roundMoney(Math.max(0, Number(employee?.transportAllowance) || 0));
  const taxableIncome = roundMoney(basicSalary + transportAllowance);
  const grossSalary = taxableIncome;
  const employeePension = roundMoney(grossSalary * EMPLOYEE_PENSION_RATE);
  const employerPension = roundMoney(grossSalary * EMPLOYER_PENSION_RATE);
  const incomeTax = calculateIncomeTax(taxableIncome);
  const loan = roundMoney(Math.max(0, Number(employee?.loan) || 0));
  const totalDeduct = roundMoney(employeePension + incomeTax + loan);
  const netPay = roundMoney(grossSalary - totalDeduct);
  const governmentRemittance = roundMoney(employeePension + employerPension + incomeTax);

  return {
    employee,
    basicSalary,
    transportAllowance,
    taxableIncome,
    grossSalary,
    employeePension,
    employerPension,
    incomeTax,
    loan,
    totalDeduct,
    netPay,
    governmentRemittance
  };
};

export const calculatePayrollTotals = (rows) =>
  rows.reduce((totals, row) => ({
    basicSalary: roundMoney(totals.basicSalary + row.basicSalary),
    transportAllowance: roundMoney(totals.transportAllowance + row.transportAllowance),
    taxableIncome: roundMoney(totals.taxableIncome + row.taxableIncome),
    grossSalary: roundMoney(totals.grossSalary + row.grossSalary),
    employeePension: roundMoney(totals.employeePension + row.employeePension),
    employerPension: roundMoney(totals.employerPension + row.employerPension),
    incomeTax: roundMoney(totals.incomeTax + row.incomeTax),
    loan: roundMoney(totals.loan + row.loan),
    totalDeduct: roundMoney(totals.totalDeduct + row.totalDeduct),
    netPay: roundMoney(totals.netPay + row.netPay),
    governmentRemittance: roundMoney(totals.governmentRemittance + row.governmentRemittance)
  }), {
    basicSalary: 0,
    transportAllowance: 0,
    taxableIncome: 0,
    grossSalary: 0,
    employeePension: 0,
    employerPension: 0,
    incomeTax: 0,
    loan: 0,
    totalDeduct: 0,
    netPay: 0,
    governmentRemittance: 0
  });
