const mongoose = require('mongoose');

// Announcement stores the message, selected audience, delivery channels, and send result.
// The send route resolves target floors/units/tenants into actual recipients.
const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  message: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: ['announcement', 'emergency', 'rent_reminder'],
    default: 'announcement'
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Recipients
  targetType: {
    type: String,
    enum: ['all_tenants', 'selected_floors', 'selected_units', 'specific_tenants'],
    required: true
  },

  // For selected_floors and selected_units
  targetIds: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel'
  }],

  targetModel: {
    type: String,
    enum: ['Floor', 'Unit', 'Tenant']
  },

  // For specific tenants
  tenantIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  }],

  // Building context
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    index: true
  },

  // Sender information
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Communication methods
  sendSMS: {
    type: Boolean,
    default: false
  },

  sendEmail: {
    type: Boolean,
    default: false
  },

  // Delivery status
  deliveryStatus: {
    sms: {
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    email: {
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    }
  },

  // Scheduled sending
  scheduledFor: {
    type: Date
  },

  sentAt: {
    type: Date
  },

  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
    default: 'draft'
  },

  // For rent reminders specifically
  relatedInvoices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  }],

  // Metadata
  notes: {
    type: String,
    default: ''
  }

}, { timestamps: true });

// Indexes support building-filtered lists, status counts, and future scheduled sends.
announcementSchema.index({ building: 1, createdAt: -1 });
announcementSchema.index({ type: 1, status: 1 });
announcementSchema.index({ scheduledFor: 1, status: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
