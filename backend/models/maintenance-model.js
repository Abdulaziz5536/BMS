const mongoose = require("mongoose");

// Maintenance tracks repair/service requests for buildings, units, and shared spaces.
const maintenanceFileSchema = new mongoose.Schema(
  {
    name: String,
    type: String,
    data: String,
    size: Number
  },
  { _id: false }
);

const maintenanceSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      index: true
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      index: true
    },
    floor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      index: true
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee"
    },
    requestId: {
      type: String,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    category: {
      type: String,
      enum: [
        "plumbing",
        "electric",
        "electrical",
        "water",
        "hvac",
        "appliance",
        "furniture",
        "pest",
        "cleaning",
        "security",
        "general",
        "other"
      ],
      default: "plumbing"
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium"
    },
    status: {
      type: String,
      enum: ["pending", "approved", "in_progress", "completed", "cancelled", "open"],
      default: "pending",
      index: true
    },
    requestedBy: {
      type: String,
      trim: true,
      default: ""
    },
    requestedDate: {
      type: Date,
      default: Date.now
    },
    scheduledDate: {
      type: Date
    },
    completedDate: {
      type: Date
    },
    estimatedCost: {
      type: Number,
      default: 0
    },
    actualCost: {
      type: Number,
      default: 0
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    },
    resolution: {
      type: String,
      trim: true,
      default: ""
    },
    images: [maintenanceFileSchema],
    attachments: [maintenanceFileSchema]
  },
  { timestamps: true }
);

maintenanceSchema.index({ building: 1, status: 1, priority: 1 });
maintenanceSchema.index({ building: 1, requestedDate: -1 });

module.exports = mongoose.model("Maintenance", maintenanceSchema);
