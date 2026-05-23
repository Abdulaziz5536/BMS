const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCsv } = require("../utils/csv-utils");
const { parseFlexibleDateInput } = require("../utils/date-utils");
const { getSystemChecks } = require("../services/system-check-service");

test("buildCsv escapes commas, quotes, and new lines", () => {
  const csv = buildCsv(
    [{ name: 'Abebe "A"', note: "Paid, complete\nDone" }],
    [
      { label: "Name", value: (row) => row.name },
      { label: "Note", value: (row) => row.note }
    ]
  );

  assert.equal(csv, 'Name,Note\n"Abebe ""A""","Paid, complete\nDone"');
});

test("parseFlexibleDateInput accepts Ethiopian-style date input", () => {
  const parsed = parseFlexibleDateInput("16/09/2018");
  assert.ok(parsed instanceof Date);
  assert.equal(Number.isNaN(parsed.getTime()), false);
});

test("system checks returns a usable checklist shape", () => {
  const result = getSystemChecks();
  assert.equal(typeof result.ok, "boolean");
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.some((check) => check.name === "MongoDB connection"));
});
