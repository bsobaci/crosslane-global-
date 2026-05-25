const nodemailer = require('nodemailer');
const { getDb } = require('../db/connection');
const config = require('../config');
const { buildAccessRequestEmail } = require('../utils/emailTemplate');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

async function sendAccessRequestEmail({ leadId, to, fullName, opportunityId, accessToken }) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[emailWorker] SMTP not configured. Skipping email for lead ${leadId}`);
    return;
  }

  const db = await getDb();

  let opportunityTitle = 'Access Request';
  if (opportunityId) {
    const opp = db.prepare('SELECT title FROM opportunities WHERE id = ?').get(opportunityId);
    if (opp) opportunityTitle = opp.title;
  }

  const html = buildAccessRequestEmail({
    fullName,
    opportunityTitle,
    token: accessToken,
  });

  try {
    await transport.sendMail({
      from: `"Crosslane Global" <${config.smtp.user}>`,
      to,
      subject: `Your Access Request — ${opportunityTitle}`,
      html,
    });

    db.prepare(
      `UPDATE leads SET email_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(leadId);
    console.log(`[emailWorker] Access request email sent to ${to}`);
  } catch (err) {
    const { v4: uuidv4 } = require('uuid');
    db.prepare(
      `INSERT INTO agent_logs (id, agent_type, event, details, status, created_at) VALUES (?, 'email_worker', 'email_failed', ?, 'error', datetime('now'))`
    ).run(uuidv4(), JSON.stringify({ lead_id: leadId, error: err.message }));
    throw err;
  }
}

module.exports = { sendAccessRequestEmail };
