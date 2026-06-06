const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCsv } = require("../utils/csv-utils");
const {
  getEthiopianMonthRange,
  normalizeDateOnlyString,
  parseFlexibleDateInput,
  parsePaymentDateInput,
  toIsoDate
} = require("../utils/date-utils");
const {
  getShortErrorMessage,
  sanitizeErrorPayload
} = require("../utils/error-response-utils");
const { getBuildingBrandName } = require("../utils/branding-utils");
const {
  getAllowedCorsOrigins,
  isOriginAllowed,
  shouldServeFrontendRoute,
  isProtectedFrontendRoute
} = require("../utils/deployment-utils");
const {
  AUTH_COOKIE_NAME,
  getAuthCookieName,
  getAuthTokenFromRequest
} = require("../utils/session-cookie-utils");
const { formatFloorLabel } = require("../utils/floor-label-utils");
const { calculateLatePenalty } = require("../utils/late-penalty-utils");
const { normalizeEthiopianPhone } = require("../utils/phone-utils");
const {
  getFrequencyMonths,
  getMonthlyRevenueValue,
  normalizePaymentFrequency
} = require("../utils/payment-frequency-utils");
const { getSystemChecks } = require("../services/system-check-service");
const { normalizeDueDateValue } = require("../services/utility-invoice-sync-service");
const {
  isPublicPath,
  isReadOnlyAllowedPath
} = require("../middleware/auth-middleware");
const {
  clearReminderHistoryForScheduleChange,
  getDaysUntilDue,
  reminderAlreadySent,
  shouldSkipReminder
} = require("../services/due-reminder-service");

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

test("parsePaymentDateInput accepts current Ethiopian year-first date values", () => {
  const referenceDate = new Date(Date.UTC(2026, 4, 31));

  assert.equal(toIsoDate(parsePaymentDateInput("2018-09-23", referenceDate)), "2026-05-31");
  assert.equal(toIsoDate(parsePaymentDateInput("2026-05-31", referenceDate)), "2026-05-31");
});

test("getEthiopianMonthRange returns Ethiopian month boundaries", () => {
  const range = getEthiopianMonthRange("2026-05-30");

  assert.equal(range.ethiopianYear, 2018);
  assert.equal(range.ethiopianMonth, 9);
  assert.equal(toIsoDate(range.start), "2026-05-09");
  assert.equal(toIsoDate(range.end), "2026-06-08");
});

test("utility invoice sync stores due dates as date-only values", () => {
  assert.equal(normalizeDueDateValue("2026-05-31T12:00:00.000Z"), "2026-05-31");
});

test("payment frequency labels and monthly values normalize old and custom values", () => {
  assert.equal(normalizePaymentFrequency("Quarterly"), "Every 3 months");
  assert.equal(normalizePaymentFrequency("quartely"), "Every 3 months");
  assert.equal(normalizePaymentFrequency("Every 4 months"), "Every 4 months");
  assert.equal(getFrequencyMonths("Every 4 months"), 4);
  assert.equal(getMonthlyRevenueValue(120000, "Every 3 months"), 40000);
  assert.equal(getMonthlyRevenueValue(120000, "Yearly"), 10000);
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
  assert.equal(typeof result.checkedAt, "string");
  assert.ok(Array.isArray(result.checks));
  assert.equal(typeof result.summary.total, "number");
  assert.equal(typeof result.summary.requiredFailures, "number");
  assert.ok(result.checks.some((check) => check.name === "MongoDB connection"));
});

test("client errors are short and safe to display", () => {
  const duplicateMessage = "MongoServerError: E11000 duplicate key error collection: bms.units index: unitId_1 dup key: { unitId: \"A-101\" }";
  const longProviderMessage = `SMS provider returned 500: ${"provider details ".repeat(20)}`;

  assert.equal(getShortErrorMessage(duplicateMessage), "This record already exists.");
  assert.ok(getShortErrorMessage(longProviderMessage).length <= 140);

  const payload = sanitizeErrorPayload({
    errors: {
      sms: [
        { tenant: "1", error: longProviderMessage },
        { tenant: "2", error: "No phone number available" },
        { tenant: "3", error: "No phone number available" },
        { tenant: "4", error: "No phone number available" }
      ]
    }
  });

  assert.equal(payload.errors.sms.length, 4);
  assert.equal(payload.errors.sms[0].error, "SMS failed. Check provider settings.");
  assert.equal(payload.errors.sms[3].error, "1 more errors hidden.");
});

test("late penalty is fixed at ten percent after due date", () => {
  assert.equal(calculateLatePenalty("2026-05-10", "2026-05-10", 20000), 0);
  assert.equal(calculateLatePenalty("2026-05-10", "2026-05-11", 20000), 2000);
  assert.equal(calculateLatePenalty("2026-05-10", "2026-06-10", 20000), 2000);
  assert.equal(calculateLatePenalty("bad-date", "2026-06-10", 20000), 0);
});

test("floor labels show basement floors as B levels", () => {
  assert.equal(formatFloorLabel(-1), "B1");
  assert.equal(formatFloorLabel("-4"), "B4");
  assert.equal(formatFloorLabel(0), "G");
  assert.equal(formatFloorLabel(3), "3");
});

test("building brand names come from the selected building", () => {
  assert.equal(getBuildingBrandName({ name: "Aymen Building" }), "Aymen Building");
  assert.equal(getBuildingBrandName({ name: "  Aymen\nBuilding  " }), "Aymen Building");
  assert.equal(getBuildingBrandName(null), "Building Management System");
});

test("deployment CORS allows only configured production origins", () => {
  const previousOrigins = process.env.CORS_ORIGINS;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.NODE_ENV = "production";
  process.env.CORS_ORIGINS = "https://bms.example.com, https://admin.example.com";

  try {
    const allowedOrigins = getAllowedCorsOrigins();

    assert.equal(isOriginAllowed("https://bms.example.com", allowedOrigins), true);
    assert.equal(isOriginAllowed("https://other.example.com", allowedOrigins), false);
    assert.equal(isOriginAllowed("", allowedOrigins), true);
  } finally {
    if (previousOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = previousOrigins;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("deployment frontend serving only catches browser page requests", () => {
  assert.equal(shouldServeFrontendRoute({
    method: "GET",
    path: "/buildings",
    headers: { accept: "text/html,application/xhtml+xml" }
  }), true);

  assert.equal(shouldServeFrontendRoute({
    method: "GET",
    path: "/buildings",
    headers: { accept: "*/*" }
  }), false);

  assert.equal(isProtectedFrontendRoute("/dashboard"), true);
  assert.equal(isProtectedFrontendRoute("/payment-status"), true);
  assert.equal(isProtectedFrontendRoute("/accounts"), true);
  assert.equal(isProtectedFrontendRoute("/login"), false);
});

test("backend auth middleware keeps only login/signup/health public", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/signup"), true);
  assert.equal(isPublicPath("/logout"), true);
  assert.equal(isPublicPath("/system/health"), true);
  assert.equal(isPublicPath("/buildings"), false);
  assert.equal(isPublicPath("/invoices"), false);
  assert.equal(isPublicPath("/users/viewers"), false);
});

test("read-only accounts can only see the simple payment status data", () => {
  assert.equal(isReadOnlyAllowedPath("GET", "/payment-status"), true);
  assert.equal(isReadOnlyAllowedPath("GET", "/buildings"), true);
  assert.equal(isReadOnlyAllowedPath("GET", "/invoices"), false);
  assert.equal(isReadOnlyAllowedPath("POST", "/invoices/123/pay"), false);
});

test("backend auth can read direct-page login cookies", () => {
  assert.equal(
    getAuthCookieName({ headers: { host: "localhost:3001" } }),
    `${AUTH_COOKIE_NAME}_3001`
  );
  assert.equal(
    getAuthTokenFromRequest({
      headers: {
        host: "localhost:3001",
        cookie: `${AUTH_COOKIE_NAME}_3001=cookie-token; ${AUTH_COOKIE_NAME}_3000=other-token`
      }
    }),
    "cookie-token"
  );
  assert.equal(
    getAuthTokenFromRequest({
      headers: {
        authorization: "Bearer api-token",
        host: "localhost:3001",
        cookie: `${AUTH_COOKIE_NAME}_3001=cookie-token`
      }
    }),
    "api-token"
  );
});

test("backend auth ignores malformed URI cookie values", () => {
  assert.equal(
    getAuthTokenFromRequest({
      headers: {
        host: "localhost:3001",
        cookie: `bad=%E0%A4%A; ${AUTH_COOKIE_NAME}_3001=cookie-token`
      }
    }),
    "cookie-token"
  );
});

test("manual reminder force option bypasses duplicate skip check", () => {
  const invoice = {
    remindersSent: [
      { type: "due_date", sentAt: new Date("2026-05-24") }
    ]
  };

  assert.equal(reminderAlreadySent(invoice, "due_date"), true);
  assert.equal(shouldSkipReminder(invoice, "due_date", { force: false }), true);
  assert.equal(shouldSkipReminder(invoice, "due_date", { force: true }), false);
  assert.equal(shouldSkipReminder(invoice, "late_payment", { force: false }), false);
});

test("schedule changes clear stale reminder history", () => {
  const invoice = {
    remindersSent: [
      { type: "due_date", sentAt: new Date("2026-05-24") },
      { type: "late_payment", sentAt: new Date("2026-05-26") }
    ]
  };

  assert.equal(clearReminderHistoryForScheduleChange(invoice), 2);
  assert.deepEqual(invoice.remindersSent, []);
  assert.equal(shouldSkipReminder(invoice, "late_payment", { force: false }), false);
});

test("reminder due-day calculation uses calendar days", () => {
  const referenceDate = new Date(2026, 4, 26, 8);

  assert.equal(getDaysUntilDue(new Date(2026, 4, 26, 0), referenceDate), 0);
  assert.equal(getDaysUntilDue(new Date(2026, 4, 25, 0), referenceDate), -1);
  assert.equal(getDaysUntilDue(new Date(2026, 4, 27, 23), referenceDate), 1);
});
