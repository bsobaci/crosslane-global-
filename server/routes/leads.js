const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { validateLeadInput } = require('../middleware/validation');
const { encrypt } = require('../utils/encrypt');
const config = require('../config');

const router = Router();

function withDb(handler) {
  return async (req, res, next) => {
    try {
      const db = await getDb();
      await handler(req, res, next, db);
    } catch (err) {
      next(err);
    }
  };
}

// POST /api/leads — submit an access request
router.post('/', withDb(async (req, res, _next, db) => {
  const { errors, honeypotTriggered, sanitized } = validateLeadInput(req.body);

  if (honeypotTriggered) {
    return res.status(200).json({
      message: 'Thank you. Your access request has been received and is under review.',
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  // Check duplicate by email + opportunity
  const existing = db.prepare(
    'SELECT id FROM leads WHERE business_email = ? AND opportunity_id = ?'
  ).get(sanitized.business_email, sanitized.opportunity_id || null);

  if (existing) {
    return res.status(200).json({
      message: 'Thank you. Your access request has been received and is under review.',
    });
  }

  const id = uuidv4();
  const accessToken = uuidv4();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const ua = (req.headers['user-agent'] || '').slice(0, 500);

  db.prepare(`
    INSERT INTO leads (id, opportunity_id, full_name, job_title, company_name,
      business_email, phone, industry, website_url, company_size, areas_of_interest,
      verification_status, ip_address, user_agent, access_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    id,
    sanitized.opportunity_id || null,
    sanitized.full_name,
    sanitized.job_title,
    sanitized.company_name,
    sanitized.business_email,
    encrypt(sanitized.phone),
    sanitized.industry,
    sanitized.website_url,
    sanitized.company_size,
    sanitized.areas_of_interest,
    ip,
    ua,
    accessToken,
  );

  // Log to agent_logs
  const logId = uuidv4();
  db.prepare(`
    INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
    VALUES (?, 'lead_capture', 'lead_created', ?, 'success', datetime('now'))
  `).run(logId, JSON.stringify({ lead_id: id, opportunity_id: sanitized.opportunity_id }));

  // Fire email worker (async, non-blocking)
  if (config.smtp.host && config.smtp.user) {
    const { sendAccessRequestEmail } = require('../workers/emailWorker');
    sendAccessRequestEmail({
      leadId: id,
      to: sanitized.business_email,
      fullName: sanitized.full_name,
      opportunityId: sanitized.opportunity_id,
      accessToken,
    }).catch(err => {
      console.error('Email worker failed:', err.message);
    });
  }

  // Fire webhook (async, non-blocking)
  if (config.slackWebhookUrl || config.telegramBotToken) {
    const { fireWebhooks } = require('../workers/webhookWorker');
    fireWebhooks({
      leadId: id,
      fullName: sanitized.full_name,
      companyName: sanitized.company_name,
      email: sanitized.business_email,
      opportunityId: sanitized.opportunity_id,
    }).catch(err => {
      console.error('Webhook worker failed:', err.message);
    });
  }

  res.status(201).json({
    message: 'Thank you. Your access request has been received and is under review.',
    access_token: accessToken,
  });
}));

module.exports = router;
