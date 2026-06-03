const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getNewInvoicePaymentFields,
  setInvoiceStatusFields
} = require("../services/payment-status-sync-service");

test("setInvoiceStatusFields marks an invoice paid with full balance cleared", () => {
  const invoice = {
    rentAmount: 80000,
    totalAmount: 80000,
    amountPaid: 0,
    outstandingBalance: 80000,
    status: "pending"
  };

  setInvoiceStatusFields(invoice, "paid");

  assert.equal(invoice.status, "paid");
  assert.equal(invoice.amountPaid, 80000);
  assert.equal(invoice.outstandingBalance, 0);
  assert.ok(invoice.paymentDate instanceof Date);
});

test("setInvoiceStatusFields resets a paid invoice back to pending", () => {
  const invoice = {
    totalAmount: 80000,
    amountPaid: 80000,
    outstandingBalance: 0,
    status: "paid",
    paymentDate: new Date()
  };

  setInvoiceStatusFields(invoice, "pending", { resetPaidAmount: true });

  assert.equal(invoice.status, "pending");
  assert.equal(invoice.amountPaid, 0);
  assert.equal(invoice.outstandingBalance, 80000);
  assert.equal(invoice.paymentDate, undefined);
});

test("setInvoiceStatusFields keeps partial payment balance when pending is not reset", () => {
  const invoice = {
    totalAmount: 80000,
    amountPaid: 30000,
    outstandingBalance: 50000,
    status: "pending"
  };

  setInvoiceStatusFields(invoice, "pending");

  assert.equal(invoice.status, "pending");
  assert.equal(invoice.amountPaid, 30000);
  assert.equal(invoice.outstandingBalance, 50000);
});

test("getNewInvoicePaymentFields starts fresh invoices pending", () => {
  assert.deepEqual(
    getNewInvoicePaymentFields(80000),
    {
      amountPaid: 0,
      outstandingBalance: 80000,
      status: "pending"
    }
  );

  assert.deepEqual(getNewInvoicePaymentFields(0), {
    amountPaid: 0,
    outstandingBalance: 0,
    status: "pending"
  });
});
