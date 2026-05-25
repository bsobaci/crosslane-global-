require('dotenv').config();

const express = require('express');
const path = require('path');
const config = require('./config');
const { securityMiddleware, apiLimiter, formLimiter } = require('./middleware/security');
const opportunitiesRoute = require('./routes/opportunities');
const leadsRoute = require('./routes/leads');
const adminRoute = require('./routes/admin');
const { startPolling } = require('./workers/samPoller');
const { startPolling: startCanadaPolling } = require('./workers/canadaBuysPoller');
const { startPolling: startMacroPolling } = require('./workers/macroAgent');
const { startPolling: startUKPolling } = require('./workers/ukPoller');
const { startPolling: startUAPolling } = require('./workers/uaPoller');
const { startBot } = require('./workers/telegramBot');

const app = express();

// ── Security middleware ──────────────────────────────────
app.use(...securityMiddleware());

// ── Body parsing ────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// ── Trust proxy for rate limiting behind reverse proxy ──
app.set('trust proxy', 1);

// ── Serve static frontend from prototype/ directory ─────
const prototypePath = path.join(__dirname, '..', 'prototype');
app.use(express.static(prototypePath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── API routes ──────────────────────────────────────────
app.use('/api/opportunities', apiLimiter, opportunitiesRoute);
app.use('/api/leads', formLimiter, leadsRoute);
app.use('/api/admin', adminRoute);

// ── Health check ────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv, timestamp: new Date().toISOString() });
});

// ── SPA fallback — serve index.html for any unmatched route ─
app.get('*', (_req, res) => {
  res.sendFile(path.join(prototypePath, 'index.html'));
});

// ── Error handler ───────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ───────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[crosslane-api] Server running on http://localhost:${PORT}`);
  console.log(`[crosslane-api] Environment: ${config.nodeEnv}`);
  console.log(`[crosslane-api] Static files: ${prototypePath}`);

  // Start SAM.gov polling (non-blocking; runs immediately then daily)
  if (config.nodeEnv !== 'test') {
    startPolling();
    startCanadaPolling();
    startUKPolling();
    startUAPolling();
    startMacroPolling();
    startBot();
  }
});
