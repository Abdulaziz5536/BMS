const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getNextInvoicePeriod,
  recalculateInvoicePeriodsForContract
} = require("../services/invoice-period-service");
const {
  formatEthiopianDate,
  parseFlexibleDateInput
} = require("../utils/date-utils");

const createFindOneModel = (latestInvoice = null) => ({
  findOne() {
    return {
      sort() {
        return Promise.resolve(latestInvoice);
      }
    };
  }
});

const createFindModel = (rows) => ({
  find() {
    return {
      sort() {
        return Promise.resolve(rows);
      }
    };
  }
});

test("getNextInvoicePeriod starts from the contract lease start when no invoice exists", async () => {
  const contract = {
    _id: "contract-1",
    leaseStartDate: "01/01/2018",
    leaseEndDate: "30/03/2018",
    paymentFrequency: "Monthly"
  };

  const period = await getNextInvoicePeriod(createFindOneModel(), contract);

  assert.equal(formatEthiopianDate(period.periodStart), "01/01/2018 EC");
  assert.equal(formatEthiopianDate(period.periodEnd), "30/01/2018 EC");
});

test("getNextInvoicePeriod continues after the latest invoice period", async () => {
  const contract = {
    _id: "contract-1",
    leaseStartDate: "01/01/2018",
    leaseEndDate: "30/03/2018",
    paymentFrequency: "Monthly"
  };
  const latestInvoice = {
    periodEnd: parseFlexibleDateInput("30/01/2018")
  };

  const period = await getNextInvoicePeriod(createFindOneModel(latestInvoice), contract);

  assert.equal(formatEthiopianDate(period.periodStart), "01/02/2018 EC");
  assert.equal(formatEthiopianDate(period.periodEnd), "30/02/2018 EC");
});

test("recalculateInvoicePeriodsForContract rewrites invoice dates and clears reminders", async () => {
  let saved = 0;
  const contract = {
    _id: "contract-1",
    leaseStartDate: "01/01/2018",
    leaseEndDate: "30/02/2018",
    paymentFrequency: "Monthly"
  };
  const invoices = [
    {
      periodStart: parseFlexibleDateInput("05/01/2018"),
      periodEnd: parseFlexibleDateInput("10/01/2018"),
      dueDate: parseFlexibleDateInput("10/01/2018"),
      remindersSent: [{ type: "due_date", message: "old" }],
      save: async () => {
        saved += 1;
      }
    },
    {
      periodStart: parseFlexibleDateInput("11/01/2018"),
      periodEnd: parseFlexibleDateInput("20/01/2018"),
      dueDate: parseFlexibleDateInput("20/01/2018"),
      remindersSent: [{ type: "due_date", message: "old" }],
      save: async () => {
        saved += 1;
      }
    }
  ];

  const result = await recalculateInvoicePeriodsForContract(createFindModel(invoices), contract);

  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 0);
  assert.equal(saved, 2);
  assert.equal(formatEthiopianDate(invoices[0].periodStart), "01/01/2018 EC");
  assert.equal(formatEthiopianDate(invoices[0].periodEnd), "30/01/2018 EC");
  assert.equal(formatEthiopianDate(invoices[1].periodStart), "01/02/2018 EC");
  assert.equal(formatEthiopianDate(invoices[1].periodEnd), "30/02/2018 EC");
  assert.deepEqual(invoices[0].remindersSent, []);
  assert.deepEqual(invoices[1].remindersSent, []);
});
