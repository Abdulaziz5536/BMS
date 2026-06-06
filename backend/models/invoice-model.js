const mongoose = require('mongoose');

// Invoice stores one rent bill for one contract period.
// Reminder history lives here so each invoice knows which due/overdue notices were sent.
const invoiceSchema = new mongoose.Schema({
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
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    index: true
  },

  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },

  periodStart: {
    type: Date,
    required: true
  },

  periodEnd: {
    type: Date,
    required: true
  },

  dueDate: {
    type: Date,
    required: true
  },

  rentAmount: {
    type: Number,
    required: true
  },

  amountPaid: {
    type: Number,
    default: 0
  },

  outstandingBalance: {
    type: Number,
    default: 0
  },

  latePenalty: {
    type: Number,
    default: 0
  },

  totalAmount: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'cancelled'],
    default: 'pending'
  },

  paymentDate: {
    type: Date
  },

  notes: {
    type: String,
    default: ''
  },

  remindersSent: [{
    type: {
      type: String,
      enum: ['due_date', 'late_payment']
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    message: String
  }]

}, { timestamps: true });

// Compound indexes keep tenant/contract period lookups fast and prevent duplicate period invoices.
invoiceSchema.index({ tenant: 1, periodStart: 1, periodEnd: 1 });
invoiceSchema.index({ contract: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ building: 1, dueDate: 1, status: 1 });
invoiceSchema.index({ building: 1, dueDate: 1, outstandingBalance: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
