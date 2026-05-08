const mongoose = require('mongoose');

const rentInvoiceSchema = new mongoose.Schema({
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

// Compound index for efficient queries
rentInvoiceSchema.index({ tenant: 1, periodStart: 1, periodEnd: 1 });
rentInvoiceSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model("RentInvoice", rentInvoiceSchema);