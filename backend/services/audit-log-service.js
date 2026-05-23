const AuditLog = require("../models/audit-log-model");

const recordAuditLog = async ({
  building,
  action,
  entityType,
  entityId,
  entityLabel,
  message,
  metadata
}) => {
  try {
    if (!action || !entityType) {
      return null;
    }

    return await AuditLog.create({
      building: building || undefined,
      action,
      entityType,
      entityId: entityId ? String(entityId) : "",
      entityLabel: entityLabel || "",
      message: message || "",
      metadata: metadata || {}
    });
  } catch (error) {
    console.error("Failed to write audit log:", error.message);
    return null;
  }
};

module.exports = {
  recordAuditLog
};
