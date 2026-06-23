const mongoose = require('mongoose');
const {
  formatFsNumber,
  formatReceiptNumber
} = require("../utils/receipt-number-utils");

// PaymentRecord is the immutable history of money received.
// It can point to a rent invoice, a contract payment action, or a utility bill.
const PAYMENT_SOURCE_FIELDS = ["invoice", "contract", "utility"];

const getPaymentSourceCount = (payment) =>
  PAYMENT_SOURCE_FIELDS.filter((field) => Boolean(payment?.[field])).length;

const paymentRecordSchema = new mongoose.Schema({
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    index: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    index: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice"
  },
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract"
  },
  utility: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Utility"
  },

  paymentDate: {
    type: Date,
    required: true
  },

  amount: {
    type: Number,
    required: true,
    min: [0.01, "Payment amount must be greater than zero"]
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'check', 'mobile_money', 'other'],
    default: 'cash'
  },

  paymentKind: {
    type: String,
    enum: ['rent', 'contract', 'utility'],
    default: 'rent'
  },

  reference: {
    type: String,
    default: ''
  },

  notes: {
    type: String,
    default: ''
  },

  receipt: {
    name: String,
    type: String,
    data: String
  },

  receiptNumber: {
    type: String,
    trim: true
  },

  fsNumber: {
    type: String,
    trim: true
  },

  idempotencyKey: {
    type: String,
    trim: true
  },

  receiptSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  hiddenFromInvoiceManagement: {
    type: Boolean,
    default: false,
    index: true
  }

}, { timestamps: true });

paymentRecordSchema.pre("validate", function validateSinglePaymentSource() {
  if (getPaymentSourceCount(this) !== 1) {
    this.invalidate(
      "source",
      "Payment record must reference exactly one invoice, contract, or utility."
    );
  }

  if (!this.receiptNumber) {
    this.receiptNumber = formatReceiptNumber(this);
  }

  if (!this.fsNumber) {
    this.fsNumber = formatFsNumber(this);
  }

  if (this.contract) {
    this.paymentKind = "contract";
  } else if (this.utility) {
    this.paymentKind = "utility";
  } else {
    this.paymentKind = "rent";
  }

  const sourceType = this.invoice ? "invoice" : this.contract ? "contract" : "utility";
  this.receiptSnapshot = {
    receiptNumber: this.receiptNumber,
    fsNumber: this.fsNumber,
    paymentKind: this.paymentKind,
    sourceType,
    sourceId: String(this[sourceType] || ""),
    amount: this.amount,
    paymentDate: this.paymentDate,
    paymentMethod: this.paymentMethod,
    ...(this.receiptSnapshot || {})
  };
});

paymentRecordSchema.statics.getPaymentSourceCount = getPaymentSourceCount;

// Indexes support tenant payment history and deleting checks for linked records.
paymentRecordSchema.index({ building: 1, paymentDate: -1 });
paymentRecordSchema.index({ tenant: 1, paymentDate: -1 });
paymentRecordSchema.index({ invoice: 1 });
paymentRecordSchema.index({ contract: 1 });
paymentRecordSchema.index({ utility: 1 });
paymentRecordSchema.index(
  { receiptNumber: 1 },
  { unique: true, sparse: true }
);
paymentRecordSchema.index(
  { fsNumber: 1 },
  { unique: true, sparse: true }
);
paymentRecordSchema.index(
  { building: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } }
  }
);

module.exports = mongoose.model("PaymentRecord", paymentRecordSchema);
