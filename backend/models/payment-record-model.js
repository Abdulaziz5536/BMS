const mongoose = require('mongoose');

// PaymentRecord is the immutable history of money received.
// It can point to a rent invoice, a contract payment action, or a utility bill.
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
    required: true
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'check', 'mobile_money', 'other'],
    default: 'cash'
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

// Indexes support tenant payment history and deleting checks for linked records.
paymentRecordSchema.index({ building: 1, paymentDate: -1 });
paymentRecordSchema.index({ tenant: 1, paymentDate: -1 });
paymentRecordSchema.index({ invoice: 1 });
paymentRecordSchema.index({ contract: 1 });
paymentRecordSchema.index({ utility: 1 });

module.exports = mongoose.model("PaymentRecord", paymentRecordSchema);
