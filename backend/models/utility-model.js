const mongoose = require("mongoose");

// Utility stores non-rent charges for a tenant, such as water, light, and generator gas.
const utilityFileSchema = new mongoose.Schema(
  {
    name: String,
    type: String,
    data: String
  },
  { _id: false }
);

const utilitySchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      index: true
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true
    },
    waterAmount: {
      type: Number,
      default: 0
    },
    lightAmount: {
      type: Number,
      default: 0
    },
    generatorGasAmount: {
      type: Number,
      default: 0
    },
    dueDate: {
      type: String,
      default: ""
    },
    paymentFrequency: {
      type: String,
      default: "Monthly"
    },
    status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending"
    },
    notes: {
      type: String,
      default: ""
    },

    remindersSent: [{
      type: {
        type: String,
        enum: ["due_date", "late_payment"]
      },
      sentAt: {
        type: Date,
        default: Date.now
      },
      message: String,
      status: {
        type: String,
        enum: ["pending", "sent", "failed"],
        default: "sent"
      },
      runKey: {
        type: String,
        default: ""
      },
      channels: [String],
      recipients: {
        sms: String,
        email: String
      },
      deliveryErrors: [String]
    }],

    // attachment (photo or pdf)
    utilityFile: utilityFileSchema
  },
  { timestamps: true }
);

utilitySchema.index({ building: 1, status: 1 });
utilitySchema.index({ building: 1, dueDate: 1, status: 1 });
utilitySchema.index({ tenant: 1, status: 1 });
utilitySchema.index({ building: 1, tenant: 1, status: 1 });

module.exports = mongoose.model("Utility", utilitySchema);
