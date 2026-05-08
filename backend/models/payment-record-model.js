const mongoose = require('mongoose');

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
    ref: "RentInvoice"
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

  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

}, { timestamps: true });

// Index for efficient queries
paymentRecordSchema.index({ tenant: 1, paymentDate: -1 });
paymentRecordSchema.index({ invoice: 1 });

module.exports = mongoose.model("PaymentRecord", paymentRecordSchema);