// Admin API routes — Moderation queue, lead management, agent logs
// Protected by a simple admin key (production: replace with proper auth middleware)

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
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

// Simple admin key check — override in production with JWT/session auth
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'crosslane-admin-dev-key';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.admin_key;
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Admin access required.' });
  }
  next();
}

// Apply admin auth to all routes
router.use(requireAdmin);

// ── Opportunities ────────────────────────────────────

// GET /api/admin/opportunities — list all (including drafts)
router.get('/opportunities', withDb(async (req, res, _next, db) => {
  const { status, limit, offset } = req.query;

  let sql = 'SELECT * FROM opportunities WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  const countSql = sql.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
  const pageLimit = Math.min(parseInt(limit, 10) || 50, 200);
  const pageOffset = parseInt(offset, 10) || 0;
  sql += ' LIMIT ? OFFSET ?';
  const allParams = [...params, pageLimit, pageOffset];

  const rows = db.prepare(sql).all(...allParams);
  const countRow = db.prepare(countSql).get(...params);
  const total = countRow ? countRow.total : 0;

  // Count drafts specifically
  const draftCount = db.prepare("SELECT COUNT(*) as total FROM opportunities WHERE status = 'draft'").get();

  res.json({
    opportunities: rows,
    total,
    draft_count: draftCount?.total || 0,
    limit: pageLimit,
    offset: pageOffset,
  });
}));

// PATCH /api/admin/opportunities/:id — update status or other fields
router.patch('/opportunities/:id', withDb(async (req, res, _next, db) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const { status, featured, title, industry, budget_min, budget_max, deadline } = req.body;
  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
  }
  if (typeof featured === 'number') {
    updates.push('featured = ?');
    params.push(featured);
  }
  if (title) {
    updates.push('title = ?');
    params.push(title);
  }
  if (industry) {
    updates.push('industry = ?');
    params.push(industry);
  }
  if (budget_min !== undefined) {
    updates.push('budget_min = ?');
    params.push(budget_min);
  }
  if (budget_max !== undefined) {
    updates.push('budget_max = ?');
    params.push(budget_max);
  }
  if (deadline) {
    updates.push('deadline = ?');
    params.push(deadline);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE opportunities SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  // Log the action
  db.prepare(`
    INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
    VALUES (?, 'admin', 'opportunity_updated', ?, 'success', datetime('now'))
  `).run(uuidv4(), JSON.stringify({ id: req.params.id, changes: req.body }));

  const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  res.json({ opportunity: updated });
}));

// DELETE /api/admin/opportunities/:id — remove an opportunity
router.delete('/opportunities/:id', withDb(async (req, res, _next, db) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  db.prepare('DELETE FROM opportunities WHERE id = ?').run(req.params.id);

  db.prepare(`
    INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
    VALUES (?, 'admin', 'opportunity_deleted', ?, 'success', datetime('now'))
  `).run(uuidv4(), JSON.stringify({ id: req.params.id, title: opp.title }));

  res.json({ deleted: true });
}));

// POST /api/admin/opportunities — manually create an opportunity
router.post('/opportunities', withDb(async (req, res, _next, db) => {
  const {
    title, industry, naics_code, region, budget_min, budget_max, currency,
    procurement_category, opportunity_type, deadline,
    executive_summary_en, executive_summary_tr,
    solicitation_number, agency_name, performance_location,
    status, featured,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required.' });
  }

  const id = uuidv4();
  const {
    location_display, execution_country, issuing_country, source_url,
  } = req.body;

  db.prepare(`
    INSERT INTO opportunities (id, title, industry, naics_code, region, budget_min, budget_max,
      currency, procurement_category, opportunity_type, deadline,
      executive_summary_en, executive_summary_tr,
      location_display, execution_country, issuing_country,
      solicitation_number, agency_name, performance_location,
      source, source_url, status, featured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    id, title, industry || null,
    naics_code ? String(naics_code) : null,
    region || 'US',
    budget_min || null, budget_max || null, currency || 'USD',
    procurement_category || null, opportunity_type || null, deadline || null,
    executive_summary_en || null, executive_summary_tr || null,
    location_display || null, execution_country || null, issuing_country || null,
    solicitation_number || null, agency_name || null, performance_location || null,
    source_url || null,
    status || 'draft', featured || 0,
  );

  const created = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  res.status(201).json({ opportunity: created });
}));

// ── Leads ────────────────────────────────────────────

// GET /api/admin/leads — list all leads
router.get('/leads', withDb(async (req, res, _next, db) => {
  const { verification_status, limit, offset } = req.query;

  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];

  if (verification_status) {
    sql += ' AND verification_status = ?';
    params.push(verification_status);
  }

  sql += ' ORDER BY created_at DESC';

  const countSql = sql.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
  const pageLimit = Math.min(parseInt(limit, 10) || 50, 200);
  const pageOffset = parseInt(offset, 10) || 0;
  sql += ' LIMIT ? OFFSET ?';
  const allParams = [...params, pageLimit, pageOffset];

  const rows = db.prepare(sql).all(...allParams);
  const countRow = db.prepare(countSql).get(...params);
  const total = countRow ? countRow.total : 0;

  const pendingCount = db.prepare("SELECT COUNT(*) as total FROM leads WHERE verification_status = 'pending'").get();
  const approvedCount = db.prepare("SELECT COUNT(*) as total FROM leads WHERE verification_status = 'approved'").get();

  res.json({
    leads: rows,
    total,
    pending_count: pendingCount?.total || 0,
    approved_count: approvedCount?.total || 0,
    limit: pageLimit,
    offset: pageOffset,
  });
}));

// PATCH /api/admin/leads/:id — update verification status
router.patch('/leads/:id', withDb(async (req, res, _next, db) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const { verification_status, access_granted_at } = req.body;

  const updates = [];
  const params = [];

  if (verification_status) {
    updates.push('verification_status = ?');
    params.push(verification_status);
  }
  if (access_granted_at !== undefined) {
    updates.push('access_granted_at = ?');
    params.push(access_granted_at || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  db.prepare(`
    INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
    VALUES (?, 'admin', 'lead_updated', ?, 'success', datetime('now'))
  `).run(uuidv4(), JSON.stringify({ id: req.params.id, changes: req.body }));

  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  res.json({ lead: updated });
}));

// ── Agent Logs ───────────────────────────────────────

// GET /api/admin/logs — view agent logs
router.get('/logs', withDb(async (req, res, _next, db) => {
  const { agent_type, status, limit, offset } = req.query;

  let sql = 'SELECT * FROM agent_logs WHERE 1=1';
  const params = [];

  if (agent_type) {
    sql += ' AND agent_type = ?';
    params.push(agent_type);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  const countSql = sql.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
  const pageLimit = Math.min(parseInt(limit, 10) || 100, 500);
  const pageOffset = parseInt(offset, 10) || 0;
  sql += ' LIMIT ? OFFSET ?';
  const allParams = [...params, pageLimit, pageOffset];

  const rows = db.prepare(sql).all(...allParams);
  const countRow = db.prepare(countSql).get(...params);
  const total = countRow ? countRow.total : 0;

  res.json({ logs: rows, total, limit: pageLimit, offset: pageOffset });
}));

// ── Dashboard Stats ──────────────────────────────────

router.get('/stats', withDb(async (_req, res, _next, db) => {
  const totalOpps = db.prepare('SELECT COUNT(*) as total FROM opportunities').get();
  const publishedOpps = db.prepare("SELECT COUNT(*) as total FROM opportunities WHERE status = 'published'").get();
  const draftOpps = db.prepare("SELECT COUNT(*) as total FROM opportunities WHERE status = 'draft'").get();
  const totalLeads = db.prepare('SELECT COUNT(*) as total FROM leads').get();
  const pendingLeads = db.prepare("SELECT COUNT(*) as total FROM leads WHERE verification_status = 'pending'").get();
  const approvedLeads = db.prepare("SELECT COUNT(*) as total FROM leads WHERE verification_status = 'approved'").get();
  const errorLogs = db.prepare("SELECT COUNT(*) as total FROM agent_logs WHERE status = 'error'").get();

  // Token usage sum
  const tokenSum = db.prepare('SELECT COALESCE(SUM(tokens_used), 0) as total FROM agent_logs').get();

  res.json({
    opportunities: {
      total: totalOpps?.total || 0,
      published: publishedOpps?.total || 0,
      draft: draftOpps?.total || 0,
    },
    leads: {
      total: totalLeads?.total || 0,
      pending: pendingLeads?.total || 0,
      approved: approvedLeads?.total || 0,
    },
    agent: {
      total_tokens_used: tokenSum?.total || 0,
      error_logs: errorLogs?.total || 0,
    },
  });
}));

// ── Agent Control ────────────────────────────────────

// POST /api/admin/agent/scan — trigger SAM.gov poll immediately
router.post('/agent/scan', withDb(async (req, res, _next, db) => {
  const { runSamPoll } = require('../workers/samPoller');
  // Don't await — fire and respond
  res.json({ message: 'SAM.gov scan triggered. Check logs for progress.' });
  runSamPoll(db).then(result => {
    console.log('[admin] Manual scan complete:', result);
  }).catch(err => {
    console.error('[admin] Manual scan failed:', err);
  });
}));

// POST /api/admin/agent/summarize — trigger AI summarization for all drafts
router.post('/agent/summarize', withDb(async (req, res, _next, db) => {
  const { runAiSummarization } = require('../workers/samPoller');
  res.json({ message: 'AI summarization triggered for all drafts.' });
  runAiSummarization(db).then(count => {
    console.log(`[admin] Manual summarization complete: ${count} summaries`);
  }).catch(err => {
    console.error('[admin] Manual summarization failed:', err);
  });
}));

// POST /api/admin/agent/summarize/:id — summarize one specific opportunity
router.post('/agent/summarize/:id', withDb(async (req, res, _next, db) => {
  const { generateSummary } = require('../workers/aiSummarizer');
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  res.json({ message: `AI summarization triggered for: ${opp.title.substring(0, 60)}` });

  try {
    const result = await generateSummary(opp);
    if (result) {
      db.prepare(`
        UPDATE opportunities SET executive_summary_en = ?, executive_summary_tr = ?, updated_at = datetime('now') WHERE id = ?
      `).run(result.en, result.tr, opp.id);
      console.log(`[admin] Summary generated for ${opp.id}`);
    }
  } catch (err) {
    console.error(`[admin] Summary failed for ${opp.id}:`, err.message);
  }
}));

// POST /api/admin/agent/pipeline — full pipeline (scan + summarize)
router.post('/agent/pipeline', withDb(async (_req, res, _next, _db) => {
  const { runFullPipeline } = require('../workers/samPoller');
  res.json({ message: 'Full pipeline triggered (scan + summarize).' });
  runFullPipeline().then(result => {
    console.log('[admin] Manual pipeline complete:', result);
  }).catch(err => {
    console.error('[admin] Manual pipeline failed:', err);
  });
}));

module.exports = router;
