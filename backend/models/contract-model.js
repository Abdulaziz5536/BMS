const mongoose = require('mongoose');

// Contract defines a tenant's rent agreement and drives generated invoice periods.
const tenantFileSchema = new mongoose.Schema(
  {
    name: String,
    type: String,
    data: String
  },
  { _id: false }
);

const contractSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      index: true
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant"
    },

    amount: {
      type: Number,
      required: true
    },

    date: {
      type: String
    },

    leaseStartDate: {
      type: String
    },

    leaseEndDate: {
      type: String
    },

    contractLength: String,
    paymentFrequency: String,

    // attachment (photo or pdf)
    contractFile: tenantFileSchema,

    status: {
      type: String,
      default: "pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
