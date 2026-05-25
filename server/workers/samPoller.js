// SAM.gov API Poller — Ingests federal procurement opportunities
// Implements: exponential backoff, request throttling, draft-mode insertion

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const config = require('../config');
const { generateSummary } = require('./aiSummarizer');

const SAM_API_BASE = 'https://sam.gov/api/prod/opportunities/v2/search';
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const REQUEST_DELAY_MS = 1200; // Throttle between pages
const MAX_RETRIES = 5;

const NAICS_CODES = [
  '541512', // IT Systems Design
  '541511', // Custom Programming
  '541519', // Other IT Services
  '236220', // Commercial Construction
  '236210', // Industrial Construction
  '541330', // Engineering Services
  '541611', // Management Consulting
  '541930', // Translation Services
  '493110', // Warehousing
  '811111', // Auto Repair
  '541690', // Technical Consulting
];

const INDUSTRY_MAP = {
  '541512': 'IT & Digital Services',
  '541511': 'IT & Digital Services',
  '541519': 'IT & Digital Services',
  '236220': 'Construction & Infrastructure',
  '236210': 'Construction & Infrastructure',
  '541330': 'Professional Services',
  '541611': 'Professional Services',
  '541930': 'Professional Services',
  '493110': 'Supply Chain & Logistics',
  '811111': 'Supply Chain & Logistics',
  '541690': 'Professional Services',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildApiUrl(apiKey, offset = 0, limit = 25) {
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: daysAgo(7),
    postedTo: daysAgo(0),
    ptype: 'o',            // opportunity type: solicitation
    limit: String(limit),
    offset: String(offset),
  });
  return `${SAM_API_BASE}?${params.toString()}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  // SAM.gov requires MM/DD/YYYY format
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function classifyIndustry(naics) {
  return INDUSTRY_MAP[naics] || 'Other';
}

function extractBudget(opp) {
  // SAM.gov doesn't always provide budget in the response; estimate from set-aside type or description
  const award = opp.award || opp.contractAward;
  if (award && award.amount) {
    const amount = parseFloat(award.amount);
    if (!isNaN(amount)) return { budget_min: Math.floor(amount * 0.8), budget_max: Math.ceil(amount * 1.2) };
  }
  // Fallback: null (admin fills budget manually)
  return { budget_min: null, budget_max: null };
}

function isAlreadyIngested(db, sourceId) {
  if (!sourceId) return false;
  return !!db.prepare('SELECT id FROM opportunities WHERE source_id = ?').get(sourceId);
}

async function fetchWithBackoff(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 429 || res.status === 503) {
      if (attempt >= MAX_RETRIES) throw new Error(`Max retries exceeded for ${url}`);
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.log(`[samPoller] Rate limited. Backing off ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`);
      await sleep(delay);
      return fetchWithBackoff(url, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`SAM.gov API returned ${res.status}: ${res.statusText}`);
    }

    return res.json();
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      if (attempt >= MAX_RETRIES) throw new Error(`Timeout exhausted for ${url}`);
      const delay = Math.pow(2, attempt) * 3000;
      await sleep(delay);
      return fetchWithBackoff(url, attempt + 1);
    }
    throw err;
  }
}

async function pollPage(apiKey, offset, db) {
  const url = buildApiUrl(apiKey, offset);
  const data = await fetchWithBackoff(url);
  console.log(`[samPoller] offset=${offset} — got ${data.opportunitiesData?.length || 0} opps (totalRecords=${data.totalRecords})`);

  // SAM.gov API returns { opportunitiesData: [...], totalRecords, limit, offset }
  const opportunities = data.opportunitiesData || data.opportunities || [];

  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    return 0;
  }

  let ingested = 0;
  let skipped_duplicate = 0, skipped_inactive = 0, skipped_error = 0;
  for (const opp of opportunities) {
    try {
      // SAM.gov field names (actual API response)
      const sourceId = opp.noticeId || opp.solicitationNumber || null;
      if (sourceId && isAlreadyIngested(db, sourceId)) { skipped_duplicate++; continue; }

      const naics = opp.naicsCode || opp.classificationCode || '';
      const industry = classifyIndustry(String(naics));
      const { budget_min, budget_max } = extractBudget(opp);
      const deadline = opp.responseDeadLine ? opp.responseDeadLine.slice(0, 10) : (opp.archiveDate || null);

      const title = opp.title || 'Untitled';
      // Agency from dotted path: "DEPT.SUBDEPT.OFFICE" → take last segment
      const agencyPath = opp.fullParentPathName || '';
      const agencyParts = agencyPath.split('.');
      const agencyShort = agencyParts[agencyParts.length - 1] || agencyPath;
      const agencyName = agencyPath || null;
      // Location from placeOfPerformance object
      const pop = opp.placeOfPerformance || {};
      const popCity = pop.city?.name || '';
      const popState = pop.state?.name || pop.state?.code || '';
      const popCountry = pop.country?.name || '';
      const location = [popCity, popState].filter(Boolean).join(', ') || null;
      // Public-safe location — state/province level only, no city
      const locationDisplay = popState || popCountry || null;
      const solNum = opp.solicitationNumber || null;
      // Source URL to SAM.gov listing
      const sourceUrl = opp.uiLink || opp.links?.[0]?.href || null;

      // Skip inactive opportunities
      if (opp.active && opp.active !== 'Yes') { skipped_inactive++; continue; }

      // Use set-aside description as opportunity type
      const oppType = opp.typeOfSetAsideDescription || opp.type || 'Solicitation';

      // Cross-border: issuing country vs execution country
      const execCountry = popCountry || 'UNITED STATES';
      const issuingCountry = 'UNITED STATES';

      const id = uuidv4();

      db.prepare(`
        INSERT INTO opportunities (id, title, industry, naics_code, region, budget_min, budget_max,
          currency, procurement_category, opportunity_type, deadline,
          executive_summary_en, executive_summary_tr,
          location_display, execution_country, issuing_country,
          solicitation_number, agency_name, performance_location,
          source, source_id, source_url, status, featured, created_at, updated_at)
        VALUES (?,?,?,?,'US',?,?,'USD',?,?,?,?,?,?,?,?,?,?,?,'sam.gov',?,?,'draft',0,datetime('now'),datetime('now'))
      `).run(
        id, title, industry, String(naics),
        budget_min, budget_max,
        industry, oppType, deadline,
        null, null,
        locationDisplay, execCountry, issuingCountry,
        solNum, agencyShort, location,
        sourceId, sourceUrl,
      );

      ingested++;
    } catch (err) {
      skipped_error++;
      console.error(`[samPoller] Error ingesting opportunity: ${err.message}`);
    }
  }

  console.log(`[samPoller] offset=${offset} — inserted ${ingested}, skipped: ${skipped_duplicate} dup, ${skipped_inactive} inactive, ${skipped_error} err`);
  return ingested;
}

async function runSamPoll(db) {
  const apiKey = config.samGovApiKey;
  if (!apiKey) {
    console.log('[samPoller] SAM.gov API key not configured. Skipping poll.');
    return { ingested: 0, error: 'API key not configured' };
  }

  const logId = uuidv4();
  const startTime = Date.now();
  let totalIngested = 0;

  try {
    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, status, created_at)
      VALUES (?, 'sam_poller', 'sync_started', ?, 'success', datetime('now'))
    `).run(logId, JSON.stringify({ start_time: new Date().toISOString() }));

    let offset = 0;
    let consecutiveEmpty = 0;

    while (consecutiveEmpty < 3 && offset < 1000) {
      const ingested = await pollPage(apiKey, offset, db);
      totalIngested += ingested;

      if (ingested === 0) {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
      }

      offset += 25;
      if (ingested > 0 || consecutiveEmpty < 3) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    const duration = Date.now() - startTime;
    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at)
      VALUES (?, 'sam_poller', 'sync_completed', ?, ?, 'success', datetime('now'))
    `).run(
      uuidv4(),
      JSON.stringify({ total_ingested: totalIngested, offset_reached: offset }),
      duration,
    );

    console.log(`[samPoller] Sync complete. Ingested ${totalIngested} new opportunities in ${Math.round(duration / 1000)}s`);
    return { ingested: totalIngested, durationMs: duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[samPoller] Sync failed: ${err.message}`);

    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at)
      VALUES (?, 'sam_poller', 'sync_error', ?, ?, 'error', datetime('now'))
    `).run(
      uuidv4(),
      JSON.stringify({ error: err.message, ingested_before_error: totalIngested }),
      duration,
    );

    return { ingested: totalIngested, error: err.message, durationMs: duration };
  }
}

// Generate AI summaries for all draft opportunities that don't have them yet
async function runAiSummarization(db) {
  if (!config.groqApiKey && !config.geminiApiKey && !config.anthropicApiKey) {
    console.log('[samPoller] No AI API key configured. Skipping AI summarization.');
    return 0;
  }

  const drafts = db.prepare(
    `SELECT id, title, industry, naics_code, region, budget_min, budget_max,
            procurement_category, deadline, agency_name, solicitation_number
     FROM opportunities
     WHERE status = 'draft' AND (executive_summary_en IS NULL OR executive_summary_en = '')`
  ).all();

  if (drafts.length === 0) {
    console.log('[samPoller] No draft opportunities need summarization.');
    return 0;
  }

  console.log(`[samPoller] Generating AI summaries for ${drafts.length} draft opportunities...`);

  let summarized = 0;
  for (const opp of drafts) {
    try {
      const result = await generateSummary(opp);
      if (result) {
        db.prepare(`
          UPDATE opportunities
          SET executive_summary_en = ?, executive_summary_tr = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(result.en, result.tr, opp.id);
        summarized++;
      }
      // Throttle between LLM calls (Gemini free: 15 RPM)
      await sleep(4000);
    } catch (err) {
      console.error(`[samPoller] AI summarization failed for ${opp.id}: ${err.message}`);
    }
  }

  console.log(`[samPoller] AI summarization complete. Summarized ${summarized}/${drafts.length}`);
  return summarized;
}

// Full pipeline: poll SAM.gov → AI summarize → ready for admin moderation
async function runFullPipeline() {
  console.log('[samPoller] Starting full ingestion pipeline...');
  const db = await getDb();

  const pollResult = await runSamPoll(db);
  const summaryCount = await runAiSummarization(db);

  console.log(`[samPoller] Pipeline complete. Polled: ${pollResult.ingested}, Summarized: ${summaryCount}`);
  return { poll: pollResult, summarized: summaryCount };
}

// Schedule recurring polling
let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  console.log(`[samPoller] Scheduled daily poll (interval: ${Math.round(POLL_INTERVAL_MS / 3600000)}h)`);

  // Run immediately on startup
  runFullPipeline().catch(err => console.error('[samPoller] Initial pipeline error:', err));

  // Then poll daily
  pollTimer = setInterval(() => {
    runFullPipeline().catch(err => console.error('[samPoller] Scheduled pipeline error:', err));
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { runFullPipeline, runSamPoll, runAiSummarization, startPolling, stopPolling };
