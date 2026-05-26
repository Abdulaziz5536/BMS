import test from "node:test";
import assert from "node:assert/strict";

import { getBuildingBrandName } from "../src/utils/brandingUtils.js";
import { formatErrorMessage } from "../src/utils/errorUtils.js";
import { formatFloorLabel } from "../src/utils/floorUtils.js";
import { normalizeDateInputForApi } from "../src/utils/dateUtils.js";
import { compareSortValues, nextSortDirection } from "../src/utils/sortUtils.js";
import { calculateVatBreakdown } from "../src/utils/taxUtils.js";

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

test("frontend sorting handles numeric strings and direction flips", () => {
  assert.equal(compareSortValues("2", "10", "asc") < 0, true);
  assert.equal(compareSortValues("2", "10", "desc") > 0, true);
  assert.equal(nextSortDirection("name", "name", "asc"), "desc");
  assert.equal(nextSortDirection("name", "floor", "desc"), "asc");
});

test("receipt VAT uses the configured 15 percent rate", () => {
  const result = calculateVatBreakdown(80000);

  assert.equal(result.subtotal, 80000);
  assert.equal(result.vat, 12000);
  assert.equal(result.totalWithVat, 92000);
});
