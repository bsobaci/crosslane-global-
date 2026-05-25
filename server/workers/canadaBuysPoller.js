// CanadaBuys Tender Poller — Ingests Canadian federal procurement opportunities
// Implements: exponential backoff, request throttling, draft-mode insertion

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const config = require('../config');

// CanadaBuys Open Data API — may require registration at canadabuys.canada.ca
// Fallback: open.canada.ca data portal CKAN API
const ENDPOINTS = [
  'https://canadabuys.canada.ca/api/tenders/search',
  'https://canadabuys.canada.ca/api/notices',
];
const OPEN_CANADA_BASE = 'https://open.canada.ca/data/api/action';

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 5;

// GSIN to our industry mapping
const GSIN_INDUSTRY_MAP = {
  'C': 'Construction & Infrastructure',
  'D': 'IT & Digital Services',
  'G': 'IT & Digital Services',
  'J': 'Construction & Infrastructure',
  'N': 'Construction & Infrastructure',
  'R': 'Professional Services',
  'T': 'Professional Services',
  'U': 'Professional Services',
  'V': 'Supply Chain & Logistics',
  'W': 'Supply Chain & Logistics',
};

function classifyIndustry(gsin) {
  if (!gsin) return 'Other';
  const prefix = gsin.charAt(0).toUpperCase();
  return GSIN_INDUSTRY_MAP[prefix] || 'Other';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAlreadyIngested(db, sourceId) {
  if (!sourceId) return false;
  return !!db.prepare('SELECT id FROM opportunities WHERE source_id = ? AND source = ?').get(sourceId, 'canadabuys');
}

// Extract province from location string
function extractProvince(loc) {
  if (!loc) return null;
  const provinces = [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland', 'Nova Scotia', 'Ontario', 'Prince Edward Island',
    'Quebec', 'Saskatchewan', 'Yukon', 'Northwest Territories', 'Nunavut',
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK', 'YT', 'NT', 'NU',
  ];
  for (const p of provinces) {
    if (loc.toLowerCase().includes(p.toLowerCase())) return p;
  }
  return null;
}

async function fetchWithBackoff(url, headers = {}, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CrosslaneGlobal/1.0 (procurement-intelligence)',
        ...headers,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 429 || res.status === 503) {
      if (attempt >= MAX_RETRIES) throw new Error('Max retries exceeded');
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      await sleep(delay);
      return fetchWithBackoff(url, headers, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    return res.json();
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      if (attempt >= MAX_RETRIES) throw new Error('Timeout exhausted');
      await sleep(Math.pow(2, attempt) * 3000);
      return fetchWithBackoff(url, headers, attempt + 1);
    }
    throw err;
  }
}

function mapCanadaBuysTender(t) {
  const gsin = t.commodityCode || t.gsin || t.commodity || '';
  const industry = classifyIndustry(gsin);
  const deadline = t.closingDate || t.tenderCloseDate || t.closeDate || null;
  const title = t.title || t.description?.substring(0, 120) || 'Untitled';
  const agencyName = t.organizationName || t.buyerName || t.department || null;
  const location = t.placeOfPerformance || t.deliveryLocation || t.region || null;
  const province = extractProvince(location || '');
  const locationDisplay = province || location || 'Canada';
  const solNum = t.solicitationNumber || t.referenceNumber || t.noticeId || null;
  const sourceId = t.noticeId || t.id || t.solicitationNumber || null;
  const sourceUrl = t.noticeURL || t.url || t.uiLink || null;

  // Budget extraction — often not provided by CanadaBuys
  let budgetMin = null, budgetMax = null;
  if (t.estimatedValue || t.contractValue) {
    const val = parseFloat(t.estimatedValue || t.contractValue);
    if (!isNaN(val)) {
      budgetMin = Math.floor(val * 0.8);
      budgetMax = Math.ceil(val * 1.2);
    }
  }

  const oppType = t.tenderType || t.procurementMethod || t.type || 'Tender';

  return {
    sourceId, title, industry, naics_code: gsin ? String(gsin) : null,
    budgetMin, budgetMax, oppType, deadline,
    solNum, agencyName, location, locationDisplay, sourceUrl,
  };
}

async function tryEndpoints(db) {
  // Try CanadaBuys direct API first
  for (const base of ENDPOINTS) {
    try {
      const url = `${base}?limit=1&page=0`;
      console.log(`[canadaBuys] Trying ${base}...`);
      const data = await fetchWithBackoff(url);
      if (data && (data.tenders || data.results || data.notices || data._embedded)) {
        console.log(`[canadaBuys] Endpoint works: ${base}`);
        return { base, data };
      }
    } catch (err) {
      console.log(`[canadaBuys] ${base} failed: ${err.message}`);
    }
  }

  // Try Open Canada CKAN API
  try {
    console.log('[canadaBuys] Trying Open Canada CKAN API...');
    const searchUrl = `${OPEN_CANADA_BASE}/package_search?q=tender&rows=2`;
    const data = await fetchWithBackoff(searchUrl);
    if (data?.result?.results?.length > 0) {
      console.log('[canadaBuys] Open Canada CKAN API works');
      return { base: 'open_canada', data };
    }
  } catch (err) {
    console.log(`[canadaBuys] Open Canada API failed: ${err.message}`);
  }

  return null;
}

async function ingestTenders(tenders, db) {
  let ingested = 0;
  for (const t of tenders) {
    try {
      const mapped = mapCanadaBuysTender(t);
      if (!mapped.sourceId) continue;
      if (isAlreadyIngested(db, mapped.sourceId)) continue;

      const id = uuidv4();
      db.prepare(`
        INSERT INTO opportunities (id, title, industry, naics_code, region, budget_min, budget_max,
          currency, procurement_category, opportunity_type, deadline,
          executive_summary_en, executive_summary_tr,
          location_display, solicitation_number, agency_name, performance_location,
          source, source_id, source_url, status, featured, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Canada', ?, ?, 'CAD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'canadabuys', ?, ?, 'draft', 0, datetime('now'), datetime('now'))
      `).run(
        id, mapped.title, mapped.industry, mapped.naics_code,
        mapped.budgetMin, mapped.budgetMax,
        mapped.industry, mapped.oppType, mapped.deadline,
        null, null,
        mapped.locationDisplay,
        mapped.solNum, mapped.agencyName, mapped.location,
        mapped.sourceId, mapped.sourceUrl,
      );
      ingested++;
    } catch (err) {
      console.error(`[canadaBuys] Error ingesting: ${err.message}`);
    }
  }
  return ingested;
}

async function pollCanadaBuys(db) {
  console.log('[canadaBuys] Starting CanadaBuys poll...');

  const logId = uuidv4();
  db.prepare(`
    INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
    VALUES (?, 'canadabuys_poller', 'sync_started', ?, 'success', datetime('now'))
  `).run(logId, JSON.stringify({ start_time: new Date().toISOString() }));

  const startTime = Date.now();
  let totalIngested = 0;

  try {
    const endpoint = await tryEndpoints(db);

    if (!endpoint) {
      console.log('[canadaBuys] No working endpoint found. Skipping poll.');
      db.prepare(`
        INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
        VALUES (?, 'canadabuys_poller', 'sync_skipped', ?, 'warning', datetime('now'))
      `).run(uuidv4(), JSON.stringify({ reason: 'No working API endpoint' }));
      return { ingested: 0, reason: 'No working API endpoint' };
    }

    // If Open Canada, we need different pagination logic
    if (endpoint.base === 'open_canada') {
      // Process results from initial search
      const results = endpoint.data?.result?.results || [];
      totalIngested += await ingestTenders(results, db);
    } else {
      // Direct API pagination
      let page = 0;
      let consecutiveEmpty = 0;
      while (consecutiveEmpty < 3 && page < 40) {
        const url = `${endpoint.base}?limit=25&page=${page}`;
        const data = await fetchWithBackoff(url);
        const items = data.tenders || data.results || data.notices || data._embedded?.tenders || [];
        if (!Array.isArray(items) || items.length === 0) {
          consecutiveEmpty++;
        } else {
          consecutiveEmpty = 0;
          const ingested = await ingestTenders(items, db);
          totalIngested += ingested;
          console.log(`[canadaBuys] Page ${page}: ${items.length} items, ${ingested} new`);
        }
        page++;
        await sleep(REQUEST_DELAY_MS);
      }
    }

    const duration = Date.now() - startTime;
    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at)
      VALUES (?, 'canadabuys_poller', 'sync_completed', ?, ?, 'success', datetime('now'))
    `).run(uuidv4(), JSON.stringify({ total_ingested: totalIngested }), duration);

    console.log(`[canadaBuys] Sync complete. Ingested ${totalIngested} in ${Math.round(duration / 1000)}s`);
    return { ingested: totalIngested, durationMs: duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[canadaBuys] Sync failed: ${err.message}`);
    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at)
      VALUES (?, 'canadabuys_poller', 'sync_error', ?, ?, 'error', datetime('now'))
    `).run(uuidv4(), JSON.stringify({ error: err.message }), duration);
    return { ingested: totalIngested, error: err.message };
  }
}

// Schedule
let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  console.log('[canadaBuys] Scheduled daily poll');

  // Run on startup
  pollCanadaBuys(getDb()).catch(err => console.error('[canadaBuys] Initial poll error:', err));

  // Then daily
  pollTimer = setInterval(async () => {
    const db = await getDb();
    pollCanadaBuys(db).catch(err => console.error('[canadaBuys] Scheduled poll error:', err));
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

module.exports = { pollCanadaBuys, startPolling, stopPolling };
