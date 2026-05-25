process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const { getDb } = require('../db/connection');
const config = require('../config');

async function fireWebhooks({ leadId, fullName, companyName, email, opportunityId }) {
  const db = await getDb();

  const oppTitle = opportunityId
    ? (db.prepare('SELECT title FROM opportunities WHERE id = ?').get(opportunityId))?.title || 'Unknown'
    : 'General Inquiry';

  const payload = {
    text: `New Lead: ${fullName} from ${companyName} requested access to "${oppTitle}"`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'New Access Request', emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Name:*\n${fullName}` },
        { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
      ]},
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Email:*\n${email}` },
        { type: 'mrkdwn', text: `*Opportunity:*\n${oppTitle}` },
      ]},
    ],
  };

  const promises = [];

  if (config.slackWebhookUrl) {
    promises.push(
      new Promise((resolve) => {
        const body = JSON.stringify(payload);
        const url = new URL(config.slackWebhookUrl);
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
      })
    );
  }

  if (config.telegramBotToken && config.telegramChatId) {
    promises.push(
      new Promise((resolve) => {
        const text = `New Lead: ${fullName} (${companyName})\nEmail: ${email}\nOpportunity: ${oppTitle}`;
        const tgUrl = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
        const url = new URL(tgUrl);
        const body = JSON.stringify({
          chat_id: config.telegramChatId,
          text,
          parse_mode: 'HTML',
        });
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
      })
    );
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
    const { v4: uuidv4 } = require('uuid');
    db.prepare(
      `UPDATE leads SET webhook_fired_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(leadId);
    db.prepare(
      `INSERT INTO agent_logs (id, agent_type, event, details, status, created_at) VALUES (?, 'webhook_worker', 'webhooks_fired', ?, 'success', datetime('now'))`
    ).run(uuidv4(), JSON.stringify({ lead_id: leadId }));
  }
}

module.exports = { fireWebhooks };
