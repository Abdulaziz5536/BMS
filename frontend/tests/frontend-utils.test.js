import test from "node:test";
import assert from "node:assert/strict";

import { getBuildingBrandName } from "../src/utils/brandingUtils.js";
import { formatErrorMessage } from "../src/utils/errorUtils.js";
import { formatFloorLabel } from "../src/utils/floorUtils.js";
import { normalizeDateInputForApi } from "../src/utils/dateUtils.js";
import { compareSortValues, nextSortDirection } from "../src/utils/sortUtils.js";
import { calculateVatBreakdown } from "../src/utils/taxUtils.js";
import { formatFsNumber } from "../src/utils/receiptUtils.js";
import { calculatePayrollRow } from "../src/utils/payrollUtils.js";
import {
  buildCustomPaymentFrequency,
  formatPaymentFrequency,
  getPaymentFrequencyFormState
} from "../src/utils/paymentFrequencyUtils.js";

test("frontend floor labels show ground and basement levels", () => {
  assert.equal(formatFloorLabel(-1), "B1");
  assert.equal(formatFloorLabel("-4"), "B4");
  assert.equal(formatFloorLabel(0), "G");
  assert.equal(formatFloorLabel(5), 5);
});

test("frontend building brand names use the active building name", () => {
  assert.equal(getBuildingBrandName({ name: "Aymen Building" }), "Aymen Building");
  assert.equal(getBuildingBrandName({ name: "  Aymen\nBuilding  " }), "Aymen Building");
  assert.equal(getBuildingBrandName(null), "Building Management System");
});

test("frontend error messages stay short and user-safe", () => {
  const duplicate = "MongoServerError: E11000 duplicate key error collection: bms.units index: unitId_1";
  const longMessage = `Provider failed: ${"very detailed failure ".repeat(20)}`;

  assert.equal(formatErrorMessage(duplicate), "This record already exists.");
  assert.equal(formatErrorMessage("Failed to fetch"), "Cannot reach the server. Check the backend.");
  assert.ok(formatErrorMessage(longMessage).length <= 140);
});

test("frontend date normalization accepts explicit Ethiopian dates", () => {
  assert.equal(normalizeDateInputForApi("2018-08-16 EC"), "2026-04-24");
  assert.equal(normalizeDateInputForApi("bad-date"), "");
});

test("frontend payment frequency labels normalize old and custom values", () => {
  assert.equal(formatPaymentFrequency("Quarterly"), "Every 3 months");
  assert.equal(formatPaymentFrequency("quartely"), "Every 3 months");
  assert.equal(formatPaymentFrequency("Every 4 months"), "Every 4 months");
  assert.deepEqual(getPaymentFrequencyFormState("Every 4 months"), {
    paymentFrequency: "Custom",
    customMonths: "4"
  });
  assert.equal(buildCustomPaymentFrequency("4"), "Every 4 months");
});

test("frontend sorting handles numeric strings and direction flips", () => {
  assert.equal(compareSortValues("2", "10", "asc") < 0, true);
  assert.equal(compareSortValues("2", "10", "desc") > 0, true);
  assert.equal(nextSortDirection("name", "name", "asc"), "desc");
  assert.equal(nextSortDirection("name", "floor", "desc"), "asc");
});

test("receipt VAT splits an already VAT-inclusive payment", () => {
  const result = calculateVatBreakdown(92000);

  assert.equal(result.subtotal, 80000);
  assert.equal(result.vat, 12000);
  assert.equal(result.totalWithVat, 92000);
});

test("receipt FS numbers stay unique and stable per payment", () => {
  const payment = {
    _id: "6655aabbccddeeff00112233",
    paymentDate: "2026-05-26T08:00:00.000Z"
  };

  assert.equal(formatFsNumber(payment), "FS-20260526-00112233");
});

test("receipt FS numbers prefer stored backend values", () => {
  assert.equal(formatFsNumber({ fsNumber: "FS-STORED-123" }), "FS-STORED-123");
});

test("payroll uses employee salary as basic pay", () => {
  const row = calculatePayrollRow({ name: "Alem", salary: 10000 });

  assert.equal(row.grossSalary, 10000);
  assert.equal(row.basicSalary, 10000);
  assert.equal(row.transportAllowance, 0);
  assert.equal(row.taxableIncome, 10000);
  assert.equal(row.incomeTax, 1650);
  assert.equal(row.employeePension, 700);
  assert.equal(row.employerPension, 1100);
  assert.equal(row.loan, 0);
  assert.equal(row.totalDeduct, 2350);
  assert.equal(row.netPay, 7650);
  assert.equal(row.governmentRemittance, 3450);
});

test("payroll includes transport allowance and loan", () => {
  const row = calculatePayrollRow({
    name: "Alem",
    salary: 10000,
    transportAllowance: 2000,
    loan: 500
  });

  assert.equal(row.basicSalary, 10000);
  assert.equal(row.transportAllowance, 2000);
  assert.equal(row.taxableIncome, 12000);
  assert.equal(row.grossSalary, 12000);
  assert.equal(row.employeePension, 840);
  assert.equal(row.employerPension, 1320);
  assert.equal(row.incomeTax, 2250);
  assert.equal(row.loan, 500);
  assert.equal(row.totalDeduct, 3590);
  assert.equal(row.netPay, 8410);
});
