const mongoose = require("mongoose");

// AuditLog records important user/system actions so the Activity and System pages can explain changes.
const auditLogSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      index: true
    },
    action: {
      type: String,
      required: true,
      trim: true
    },
    entityType: {
      type: String,
      required: true,
      trim: true
    },
    entityId: {
      type: String,
      default: ""
    },
    entityLabel: {
      type: String,
      default: ""
    },
    actorId: {
      type: String,
      default: ""
    },
    actorName: {
      type: String,
      default: ""
    },
    actorEmail: {
      type: String,
      default: ""
    },
    actorRole: {
      type: String,
      default: ""
    },
    message: {
      type: String,
      default: ""
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ building: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
