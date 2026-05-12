const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const router = express.Router();

const Announcement = require('../models/announcement-model');
const Tenant = require('../models/tenant-model');
const Floor = require('../models/floor-model');
const Unit = require('../models/unit-model');
const Building = require('../models/building-model');

// Email transporter configuration
const emailTransportOptions = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true' ? true : false
  }
};

if (process.env.SMTP_SERVICE) {
  emailTransportOptions.service = process.env.SMTP_SERVICE;
}

const emailTransporter = nodemailer.createTransport(emailTransportOptions);

emailTransporter.verify((error, success) => {
  if (error) {
    console.error('Email transporter verification failed:', error);
  } else {
    console.log('Email transporter is ready to send messages');
  }
});

// Ethiopian SMS service configuration (placeholder - replace with actual service)
const SMS_CONFIG = {
  apiKey: process.env.SMS_API_KEY,
  apiUrl: process.env.SMS_API_URL || 'https://api.ethiosms.com/send',
  senderId: process.env.SMS_SENDER_ID
};

// Helper function to get recipients based on target type
async function getRecipients(announcement) {
  const { targetType, targetIds, tenantIds, building } = announcement;
  let recipients = [];

  switch (targetType) {
    case 'all_tenants':
      recipients = await Tenant.find({ building }).populate('unit');
      break;

    case 'selected_floors':
      const floors = await Floor.find({ _id: { $in: targetIds }, building });
      const floorIds = floors.map(f => f._id);
      recipients = await Tenant.find({ floor: { $in: floorIds } }).populate('unit');
      break;

    case 'selected_units':
      recipients = await Tenant.find({ unit: { $in: targetIds } }).populate('unit');
      break;

    case 'specific_tenants':
      recipients = await Tenant.find({ _id: { $in: tenantIds } }).populate('unit');
      break;
  }

  return recipients;
}

// Helper function to send SMS (Ethiopian phone numbers)
async function sendSMS(phoneNumber, message) {
  try {
    // Ethiopian phone number formatting
    let formattedNumber = phoneNumber.replace(/\s+/g, '');
    if (formattedNumber.startsWith('+251')) {
      formattedNumber = formattedNumber.substring(4);
    } else if (formattedNumber.startsWith('251')) {
      formattedNumber = formattedNumber.substring(3);
    } else if (formattedNumber.startsWith('0')) {
      formattedNumber = formattedNumber.substring(1);
    }
    formattedNumber = '+251' + formattedNumber;

    // Placeholder SMS sending logic - replace with actual Ethiopian SMS service
    console.log(`Sending SMS to ${formattedNumber}: ${message}`);

    // Simulate API call
    const response = await fetch(SMS_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SMS_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        to: formattedNumber,
        message: message
      })
    });

    if (response.ok) {
      return { success: true };
    } else {
      throw new Error('SMS sending failed');
    }
  } catch (error) {
    console.error('SMS sending error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to send email
async function sendEmail(email, subject, message) {
  try {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: subject,
      text: message,
      html: message.replace(/\n/g, '<br>')
    };

    const info = await emailTransporter.sendMail(mailOptions);
    if (!info || !info.messageId) {
      throw new Error('No message ID returned from SMTP server');
    }
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message || 'Unknown email error' };
  }
}

// Create announcement
router.post('/', async (req, res) => {
  try {
    const announcementData = {
      ...req.body,
      sentBy: req.body.sentBy || null, // Allow null for now
      sendSMS: req.body.sendSMS || false,
      sendEmail: req.body.sendEmail || false
    };

    // For selected floors/units, we need building context
    if ((announcementData.targetType === 'selected_floors' || announcementData.targetType === 'selected_units') && !announcementData.building) {
      // For now, get the first building
      const firstBuilding = await Building.findOne();
      if (firstBuilding) {
        announcementData.building = firstBuilding._id;
      }
    }

    // Validate target IDs based on target type
    if (announcementData.targetType === 'selected_floors' || announcementData.targetType === 'selected_units') {
      if (!announcementData.targetIds || announcementData.targetIds.length === 0) {
        return res.status(400).json({ error: 'Target IDs are required for selected floors/units' });
      }

      // Validate ObjectIds
      for (const id of announcementData.targetIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ error: `Invalid target ID: ${id}` });
        }
      }
    }

    if (announcementData.targetType === 'specific_tenants') {
      if (!announcementData.tenantIds || announcementData.tenantIds.length === 0) {
        return res.status(400).json({ error: 'Tenant IDs are required for specific tenants' });
      }

      // Validate ObjectIds
      for (const id of announcementData.tenantIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ error: `Invalid tenant ID: ${id}` });
        }
      }
    }

    const announcement = new Announcement(announcementData);
    await announcement.save({ validateBeforeSave: false });
    res.json({ message: 'Announcement created successfully', announcement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get announcements
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building ID' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }

    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    const announcements = await Announcement.find(filter)
      .populate('building')
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send announcement
router.post('/:id/send', async (req, res) => {
  let announcement;

  try {
    announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.status === 'sent') {
      return res.status(400).json({ error: 'Announcement already sent' });
    }

    // Get recipients
    const recipients = await getRecipients(announcement);

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients found for this announcement' });
    }

    // Update status to sending
    announcement.status = 'sending';
    await announcement.save();

    let smsSent = 0, smsFailed = 0;
    let emailSent = 0, emailFailed = 0;
    const smsErrors = [];
    const emailErrors = [];

    // Send communications
    for (const tenant of recipients) {
      const subject = announcement.type === 'emergency' ?
        `🚨 EMERGENCY ALERT: ${announcement.title}` :
        announcement.type === 'rent_reminder' ?
        `Rent Reminder: ${announcement.title}` :
        `Announcement: ${announcement.title}`;

      // Send SMS if requested
      if (announcement.sendSMS) {
        if (tenant.phone) {
          const smsResult = await sendSMS(tenant.phone, announcement.message);
          if (smsResult.success) {
            smsSent++;
          } else {
            smsFailed++;
            smsErrors.push({ tenant: tenant._id, phone: tenant.phone, error: smsResult.error });
          }
        } else {
          smsFailed++;
          smsErrors.push({ tenant: tenant._id, error: 'No phone number available' });
        }
      }

      // Send email if requested
      if (announcement.sendEmail) {
        if (tenant.email) {
          const emailResult = await sendEmail(tenant.email, subject, announcement.message);
          if (emailResult.success) {
            emailSent++;
          } else {
            emailFailed++;
            emailErrors.push({ tenant: tenant._id, email: tenant.email, error: emailResult.error });
          }
        } else {
          emailFailed++;
          emailErrors.push({ tenant: tenant._id, error: 'No email address available' });
        }
      }
    }

    // Update delivery status and mark status based on actual success counts
    announcement.deliveryStatus = {
      sms: {
        sent: smsSent,
        failed: smsFailed,
        total: smsSent + smsFailed
      },
      email: {
        sent: emailSent,
        failed: emailFailed,
        total: emailSent + emailFailed
      }
    };

    const totalSent = smsSent + emailSent;
    announcement.status = totalSent > 0 ? 'sent' : 'failed';
    if (totalSent > 0) {
      announcement.sentAt = new Date();
    }
    await announcement.save();

    res.json({
      message: totalSent > 0 ? 'Announcement sent successfully' : 'Announcement failed to send',
      announcement,
      delivery: {
        sms: { sent: smsSent, failed: smsFailed },
        email: { sent: emailSent, failed: emailFailed }
      },
      errors: {
        sms: smsErrors,
        email: emailErrors
      }
    });
  } catch (error) {
    // Mark as failed if error occurs
    if (announcement) {
      announcement.status = 'failed';
      await announcement.save();
    }
    res.status(500).json({ error: error.message });
  }
});

// Get announcement by ID
router.get('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('building')
      .populate('sentBy', 'name email')
      .populate('targetIds')
      .populate('tenantIds', 'tenantName phone email');

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update announcement (using PUT for better compatibility)
router.put('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('building').populate('sentBy', 'name email');

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement updated', announcement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Also support PATCH method
router.patch('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('building').populate('sentBy', 'name email');

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement updated', announcement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete announcement
router.delete('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get announcement statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const filter = {};
    if (req.query.building) {
      if (!mongoose.Types.ObjectId.isValid(req.query.building)) {
        return res.status(400).json({ error: 'Invalid building ID' });
      }
      filter.building = new mongoose.Types.ObjectId(req.query.building);
    }

    const stats = await Announcement.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          scheduled: { $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          emergency: { $sum: { $cond: [{ $eq: ['$type', 'emergency'] }, 1, 0] } },
          announcements: { $sum: { $cond: [{ $eq: ['$type', 'announcement'] }, 1, 0] } },
          reminders: { $sum: { $cond: [{ $eq: ['$type', 'rent_reminder'] }, 1, 0] } }
        }
      }
    ]);

    const summary = stats[0] || {
      total: 0, sent: 0, scheduled: 0, draft: 0,
      emergency: 0, announcements: 0, reminders: 0
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;