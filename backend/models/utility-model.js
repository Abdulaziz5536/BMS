const mongoose = require("mongoose");

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
      enum: ["Monthly", "Quarterly", "Every 6 months", "Yearly"],
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

    // attachment (photo or pdf)
    utilityFile: {
      name: String,
      type: String,
      data: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Utility", utilitySchema);
