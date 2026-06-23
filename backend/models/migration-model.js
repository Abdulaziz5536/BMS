const mongoose = require("mongoose");

const migrationSchema = new mongoose.Schema(
  {
    migrationId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      default: ""
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Migration", migrationSchema);
