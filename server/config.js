const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/crosslane.db',
  encryptionKey: process.env.ENCRYPTION_KEY,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  eiaApiKey: process.env.EIA_API_KEY,
  samGovApiKey: process.env.SAM_GOV_API_KEY,
  adminApiKey: process.env.ADMIN_API_KEY || 'crosslane-admin-dev-key',

  // Blocked email domains for business validation
  blockedEmailDomains: [
    'gmail.com', 'gmail.co.uk', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'outlook.com', 'outlook.fr',
    'live.com', 'live.fr', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
    'mac.com', 'protonmail.com', 'proton.me', 'mail.com', 'email.com',
    'yandex.com', 'yandex.ru', 'mail.ru', 'inbox.ru', 'list.ru',
    'bk.ru', 'gmx.com', 'gmx.de', 'web.de', 't-online.de',
    'wp.pl', 'o2.pl', 'interia.pl', 'onet.pl',
    'googlemail.com', 'ymail.com', 'rocketmail.com',
  ],

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // per IP
    formWindowMs: 60 * 60 * 1000, // 1 hour
    formMax: 5,                // per IP for form submissions
  },
};
