const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCsv } = require("../utils/csv-utils");
const {
  normalizeDateOnlyString,
  parseFlexibleDateInput
} = require("../utils/date-utils");
const { normalizeEthiopianPhone } = require("../utils/phone-utils");
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

test("normalizeDateOnlyString keeps native ISO date input as Gregorian", () => {
  assert.equal(normalizeDateOnlyString("2018-08-16"), "2018-08-16");
  assert.equal(normalizeDateOnlyString("2018-08-16 EC"), "2026-04-24");
});

test("normalizeEthiopianPhone accepts local and international mobile numbers", () => {
  assert.equal(normalizeEthiopianPhone("0912345678"), "+251912345678");
  assert.equal(normalizeEthiopianPhone("0712345678"), "+251712345678");
  assert.equal(normalizeEthiopianPhone("251912345678"), "+251912345678");
  assert.equal(normalizeEthiopianPhone("+251912345678"), "+251912345678");
});

test("normalizeEthiopianPhone rejects non-Ethiopian or incomplete numbers", () => {
  assert.throws(() => normalizeEthiopianPhone("+12025550123"));
  assert.throws(() => normalizeEthiopianPhone("+2519123"));
  assert.equal(normalizeEthiopianPhone("", { required: false }), "");
});

test("system checks returns a usable checklist shape", () => {
  const result = getSystemChecks();
  assert.equal(typeof result.ok, "boolean");
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.some((check) => check.name === "MongoDB connection"));
});
