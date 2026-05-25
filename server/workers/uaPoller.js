// Ukraine ProZorro Poller — Free, no key, public API

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');

const PROZORRO_API = 'https://public-api.prozorro.gov.ua/api/2.5';
const POLL_INTERVAL = 12 * 60 * 60 * 1000;
const REQUEST_DELAY = 1500;

const CATEGORY_MAP = {
  'будівельн': 'Construction & Infrastructure',
  'будівництв': 'Construction & Infrastructure',
  'ремонт': 'Construction & Infrastructure',
  'доріг': 'Construction & Infrastructure',
  'construction': 'Construction & Infrastructure',
  'it': 'IT & Digital Services',
  'програмн': 'IT & Digital Services',
  'компютер': 'IT & Digital Services',
  'оборона': 'Defense & Security',
  'збро': 'Defense & Security',
  'військов': 'Defense & Security',
  'defense': 'Defense & Security',
  'медичн': 'Healthcare & Medical',
  'ліки': 'Healthcare & Medical',
  'medical': 'Healthcare & Medical',
  'транспорт': 'Supply Chain & Logistics',
  'логістик': 'Supply Chain & Logistics',
  'паливо': 'Energy',
  'енерг': 'Energy',
  'нафт': 'Energy',
  'gas': 'Energy',
  'консалтинг': 'Professional Services',
  'консультац': 'Professional Services',
};

function classifyCategory(title) {
  const text = (title || '').toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(kw)) return cat;
  }
  return 'Other';
}

async function fetchTenderDetail(id) {
  const res = await fetch(`${PROZORRO_API}/tenders/${id}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return (await res.json()).data;
}

async function pollUkraine(db) {
  console.log('[uaPoller] Starting...');
  db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, status, created_at) VALUES (?, 'ua_poller', 'sync_started', ?, 'success', datetime('now'))`).run(uuidv4(), '{}');

  const startTime = Date.now();
  let ingested = 0;

  try {
    const offset = new Date();
    offset.setDate(offset.getDate() - 7);
    const fromDate = offset.toISOString().substring(0, 10);

    const listRes = await fetch(`${PROZORRO_API}/tenders?offset=${fromDate}&limit=100&mode=all`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!listRes.ok) throw new Error(`ProZorro ${listRes.status}`);
    const list = await listRes.json();
    const items = list.data || [];
    console.log(`[uaPoller] Found ${items.length} tenders`);

    for (const item of items) {
      try {
        if (!item.id) continue;
        if (db.prepare('SELECT id FROM opportunities WHERE source_id = ? AND source = ?').get(item.id, 'prozorro')) continue;

        const detail = await fetchTenderDetail(item.id);
        if (!detail) continue;

        const title = detail.title || item.title || 'Untitled';
        const industry = classifyCategory(title);
        const deadline = detail.tenderPeriod?.endDate?.substring(0, 10) || null;
        const budget = detail.value?.amount || null;
        const buyer = detail.procuringEntity?.name || null;
        const region = detail.procuringEntity?.address?.region || '';
        const country = detail.procuringEntity?.address?.countryName || 'Ukraine';
        const location = [region, country].filter(Boolean).join(', ');

        const id = uuidv4();
        db.prepare(`INSERT INTO opportunities (id, title, industry, naics_code, region, budget_min, budget_max, currency, procurement_category, opportunity_type, deadline, executive_summary_en, executive_summary_tr, location_display, execution_country, issuing_country, solicitation_number, agency_name, performance_location, source, source_id, source_url, status, featured, created_at, updated_at) VALUES (?,?,?,null,'UA',?,?,'UAH',?,?,?,null,null,?,?,?,?,?,?,'prozorro',?,null,'draft',0,datetime('now'),datetime('now'))`).run(
          id, title, industry,
          budget ? Math.floor(budget * 0.8) : null, budget ? Math.ceil(budget * 1.2) : null,
          industry, detail.procurementMethodType || 'Tender', deadline,
          location, 'UKRAINE', 'UKRAINE',
          detail.tenderID || item.id, buyer, location,
          item.id,
        );
        ingested++;
        await new Promise(r => setTimeout(r, REQUEST_DELAY));
      } catch(e) { console.error('[uaPoller] Item error:', e.message); }
    }

    const duration = Date.now() - startTime;
    db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at) VALUES (?, 'ua_poller', 'sync_completed', ?, ?, 'success', datetime('now'))`).run(uuidv4(), JSON.stringify({ ingested }), duration);
    console.log(`[uaPoller] Done. ${ingested} new in ${Math.round(duration/1000)}s`);
    return { ingested };
  } catch (e) {
    console.error('[uaPoller] Error:', e.message);
    db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, status, created_at) VALUES (?, 'ua_poller', 'sync_error', ?, 'error', datetime('now'))`).run(uuidv4(), JSON.stringify({ error: e.message }));
    return { ingested, error: e.message };
  }
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  console.log('[uaPoller] Scheduled every 12h');
  getDb().then(db => pollUkraine(db)).catch(e => console.error('[uaPoller] Init error:', e));
  pollTimer = setInterval(() => getDb().then(db => pollUkraine(db)).catch(e => console.error(e)), POLL_INTERVAL);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

module.exports = { pollUkraine, startPolling, stopPolling };
