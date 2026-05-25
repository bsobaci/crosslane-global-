// UK Find a Tender Poller — Ingests UK public procurement
// Free API, no key required. OCDS format.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');

const UK_API = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
const POLL_INTERVAL = 12 * 60 * 60 * 1000; // 12h
const REQUEST_DELAY = 2000;

const CATEGORY_MAP = {
  'construction': 'Construction & Infrastructure',
  'it': 'IT & Digital Services',
  'software': 'IT & Digital Services',
  'security': 'Defense & Security',
  'defence': 'Defense & Security',
  'defense': 'Defense & Security',
  'health': 'Healthcare & Medical',
  'medical': 'Healthcare & Medical',
  'transport': 'Supply Chain & Logistics',
  'logistics': 'Supply Chain & Logistics',
  'consult': 'Professional Services',
  'advisory': 'Professional Services',
  'legal': 'Professional Services',
  'estate': 'Real Estate',
  'property': 'Real Estate',
};

function classifyCategory(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(kw)) return cat;
  }
  return 'Other';
}

async function fetchUKPage(updatedFrom, pageSize = 50) {
  const params = new URLSearchParams({ limit: String(pageSize) });
  if (updatedFrom) params.append('updatedFrom', updatedFrom);
  const url = `${UK_API}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'CrosslaneGlobal/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`UK API ${res.status}`);
  return res.json();
}

async function pollUK(db) {
  console.log('[ukPoller] Starting UK procurement scan...');
  const logId = uuidv4();
  db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, status, created_at) VALUES (?, 'uk_poller', 'sync_started', ?, 'success', datetime('now'))`).run(logId, '{}');

  const startTime = Date.now();
  let ingested = 0;

  try {
    // Check last update time
    const lastLog = db.prepare("SELECT details FROM agent_logs WHERE agent_type='uk_poller' AND event='sync_completed' ORDER BY created_at DESC LIMIT 1").get();
    let updatedFrom = null;
    if (lastLog) {
      try { updatedFrom = JSON.parse(lastLog.details).last_updated; } catch(e) {}
    }

    let page = 0;
    let hasMore = true;
    while (hasMore && page < 20) {
      const data = await fetchUKPage(updatedFrom);
      const releases = data.releases || [];
      if (releases.length === 0) { hasMore = false; break; }

      for (const rel of releases) {
        try {
          const tender = rel.tender || {};
          const buyer = rel.buyer || {};
          const sourceId = rel.ocid || rel.id || null;
          if (!sourceId) continue;
          if (db.prepare('SELECT id FROM opportunities WHERE source_id = ? AND source = ?').get(sourceId, 'uk_tender')) continue;

          const title = tender.title || 'Untitled';
          const desc = tender.description || '';
          const industry = classifyCategory(title, desc);
          const deadline = tender.tenderPeriod?.endDate?.substring(0, 10) || null;
          const budget = tender.value?.amount || null;
          const currency = tender.value?.currency || 'GBP';
          const agencyName = buyer.name || null;
          const location = tender.deliveryAddress?.region || tender.deliveryAddress?.countryName || 'United Kingdom';

          const id = uuidv4();
          db.prepare(`INSERT INTO opportunities (id, title, industry, naics_code, region, budget_min, budget_max, currency, procurement_category, opportunity_type, deadline, executive_summary_en, executive_summary_tr, location_display, execution_country, issuing_country, solicitation_number, agency_name, performance_location, source, source_id, source_url, status, featured, created_at, updated_at) VALUES (?,?,?,null,'UK',?,?,'GBP',?,?,?,?,?,?,?,?,?,?,?,'uk_tender',?,null,'draft',0,datetime('now'),datetime('now'))`).run(
            id, title, industry,
            budget ? Math.floor(budget * 0.8) : null, budget ? Math.ceil(budget * 1.2) : null,
            industry, tender.procurementMethod || 'Tender', deadline,
            null, null,
            location, 'UNITED KINGDOM', 'UNITED KINGDOM',
            tender.id || null, agencyName, tender.deliveryAddress?.streetAddress || location,
            sourceId,
          );
          ingested++;
        } catch(e) { console.error('[ukPoller] Item error:', e.message); }
      }

      updatedFrom = new Date().toISOString().substring(0, 19);
      page++;
      await new Promise(r => setTimeout(r, REQUEST_DELAY));
    }

    const duration = Date.now() - startTime;
    db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at) VALUES (?, 'uk_poller', 'sync_completed', ?, ?, 'success', datetime('now'))`).run(uuidv4(), JSON.stringify({ ingested, last_updated: updatedFrom }), duration);
    console.log(`[ukPoller] Done. ${ingested} new tenders in ${Math.round(duration/1000)}s`);
    return { ingested };
  } catch (e) {
    console.error('[ukPoller] Error:', e.message);
    db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, status, created_at) VALUES (?, 'uk_poller', 'sync_error', ?, 'error', datetime('now'))`).run(uuidv4(), JSON.stringify({ error: e.message }));
    return { ingested, error: e.message };
  }
}

// Schedule
let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  console.log('[ukPoller] Scheduled every 12h');
  getDb().then(db => pollUK(db)).catch(e => console.error('[ukPoller] Init error:', e));
  pollTimer = setInterval(() => getDb().then(db => pollUK(db)).catch(e => console.error(e)), POLL_INTERVAL);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

module.exports = { pollUK, startPolling, stopPolling };
