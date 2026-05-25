// Macro-Economic Intelligence Agent v2
// Expanded: energy, commodities, demographics, defense, trade, FDI, UN data
// All FREE APIs — no paid keys required

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');

// ── FREE API endpoints ────────────────────────────
const WORLD_BANK = 'https://api.worldbank.org/v2';
const ECB_RATES = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const ALPHA_VANTAGE = 'https://www.alphavantage.co/query';

// ═══ WORLD BANK INDICATORS ═══════════════════════════
const ALL_INDICATORS = {
  // ── Macro Economy ──
  'NY.GDP.MKTP.CD':     { cat: 'Ekonomi', label: 'GDP (current USD)' },
  'NY.GDP.MKTP.KD.ZG':  { cat: 'Ekonomi', label: 'GDP growth (%)' },
  'NY.GDP.PCAP.CD':     { cat: 'Ekonomi', label: 'GDP per capita (USD)' },
  'FP.CPI.TOTL.ZG':     { cat: 'Ekonomi', label: 'Inflation (%)' },
  'SL.UEM.TOTL.ZS':     { cat: 'Ekonomi', label: 'Unemployment (%)' },
  'FR.INR.RINR':        { cat: 'Ekonomi', label: 'Real interest rate (%)' },
  'PA.NUS.FCRF':        { cat: 'Ekonomi', label: 'Official exchange rate (LCU per USD)' },
  'GC.DOD.TOTL.GD.ZS':  { cat: 'Ekonomi', label: 'Central govt debt (% GDP)' },
  'BN.CAB.XOKA.GD.ZS':  { cat: 'Ekonomi', label: 'Current account balance (% GDP)' },
  'GC.TAX.TOTL.GD.ZS':  { cat: 'Ekonomi', label: 'Tax revenue (% GDP)' },

  // ── Trade ──
  'NE.EXP.GNFS.CD':     { cat: 'Ticaret', label: 'Exports (current USD)' },
  'NE.IMP.GNFS.CD':     { cat: 'Ticaret', label: 'Imports (current USD)' },
  'TG.VAL.TOTL.GD.ZS':  { cat: 'Ticaret', label: 'Trade (% GDP)' },

  // ── FDI & Investment ──
  'BX.KLT.DINV.WD.GD.ZS': { cat: 'FDI', label: 'FDI net inflows (% GDP)' },
  'BX.KLT.DINV.CD.WD':    { cat: 'FDI', label: 'FDI net inflows (USD)' },
  'BM.TRF.PWKR.CD.DT':    { cat: 'FDI', label: 'Remittances received (USD)' },
  'NE.GDI.TOTL.ZS':       { cat: 'FDI', label: 'Gross capital formation (% GDP)' },

  // ── Demographics ──
  'SP.POP.TOTL':        { cat: 'Demografi', label: 'Population, total' },
  'SP.POP.GROW':        { cat: 'Demografi', label: 'Population growth (%)' },
  'SP.URB.TOTL.IN.ZS':  { cat: 'Demografi', label: 'Urban population (%)' },
  'SP.DYN.LE00.IN':     { cat: 'Demografi', label: 'Life expectancy (years)' },
  'SP.DYN.CDRT.IN':     { cat: 'Demografi', label: 'Death rate (per 1000)' },

  // ── Education ──
  'SE.PRM.ENRR':        { cat: 'Egitim', label: 'Primary enrollment (%)' },
  'SE.SEC.ENRR':        { cat: 'Egitim', label: 'Secondary enrollment (%)' },
  'SE.TER.ENRR':        { cat: 'Egitim', label: 'Tertiary enrollment (%)' },
  'SE.ADT.LITR.ZS':     { cat: 'Egitim', label: 'Adult literacy rate (%)' },

  // ── Health ──
  'SH.XPD.CHEX.GD.ZS':  { cat: 'Saglik', label: 'Health expenditure (% GDP)' },
  'SH.MED.BEDS.ZS':     { cat: 'Saglik', label: 'Hospital beds (per 1000)' },

  // ── Military ──
  'MS.MIL.XPND.GD.ZS':  { cat: 'Savunma', label: 'Military expenditure (% GDP)' },
  'MS.MIL.XPND.CD':     { cat: 'Savunma', label: 'Military expenditure (USD)' },
  'MS.MIL.TOTL.P1':     { cat: 'Savunma', label: 'Armed forces personnel' },

  // ── Infrastructure ──
  'IT.NET.USER.ZS':     { cat: 'Altyapi', label: 'Internet users (% population)' },
  'IT.CEL.SETS.P2':     { cat: 'Altyapi', label: 'Mobile subscriptions (per 100)' },
  'IS.RRS.TOTL.KM':     { cat: 'Altyapi', label: 'Rail lines (total km)' },

  // ── Energy & Environment ──
  'EG.USE.PCAP.KG.OE':  { cat: 'Enerji', label: 'Energy use per capita (kg oil eq)' },
  'EG.FEC.RNEW.ZS':     { cat: 'Enerji', label: 'Renewable energy (% total)' },
  'EN.ATM.CO2E.PC':     { cat: 'Enerji', label: 'CO2 emissions per capita (tons)' },
};

// ═══ WORLD BANK COMMODITY PRICES ═════════════════════
const COMMODITIES = {
  'CRUDE_BRENT':  { cat: 'Enerji', label: 'Brent Crude Oil ($/bbl)' },
  'CRUDE_WTI':    { cat: 'Enerji', label: 'WTI Crude Oil ($/bbl)' },
  'NATGAS_US':    { cat: 'Enerji', label: 'US Natural Gas ($/mmbtu)' },
  'NATGAS_EUR':   { cat: 'Enerji', label: 'European Natural Gas ($/mmbtu)' },
  'COAL_AUS':     { cat: 'Enerji', label: 'Australian Coal ($/mt)' },
  'GOLD':         { cat: 'Emtia', label: 'Gold ($/oz)' },
  'SILVER':       { cat: 'Emtia', label: 'Silver ($/oz)' },
  'COPPER':       { cat: 'Emtia', label: 'Copper ($/mt)' },
  'ALUMINUM':     { cat: 'Emtia', label: 'Aluminum ($/mt)' },
  'IRON_ORE':     { cat: 'Emtia', label: 'Iron Ore ($/mt)' },
  'STEEL_HRC':    { cat: 'Emtia', label: 'Hot-Rolled Steel ($/mt)' },
  'WHEAT':        { cat: 'Tarim', label: 'Wheat ($/mt)' },
  'CORN':         { cat: 'Tarim', label: 'Corn ($/mt)' },
  'SOYBEAN':      { cat: 'Tarim', label: 'Soybeans ($/mt)' },
  'SUGAR':        { cat: 'Tarim', label: 'Sugar ($/kg)' },
  'COFFEE':       { cat: 'Tarim', label: 'Coffee ($/kg)' },
};

// Countries we track
const TRACKED_COUNTRIES = ['US', 'TR', 'DE', 'CN', 'JP', 'GB', 'CA', 'FR', 'IT', 'KR', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'IN', 'BR'];
const GULF_COUNTRIES = ['SA', 'AE', 'QA', 'KW', 'BH', 'OM'];
// GDELT country codes mapped to our codes
const GDELT_COUNTRY_MAP = {
  'US': 'United States', 'TR': 'Turkey', 'DE': 'Germany', 'CN': 'China',
  'JP': 'Japan', 'GB': 'United Kingdom', 'CA': 'Canada', 'FR': 'France',
  'IT': 'Italy', 'KR': 'South Korea', 'SA': 'Saudi Arabia',
  'AE': 'United Arab Emirates', 'QA': 'Qatar', 'KW': 'Kuwait',
  'BH': 'Bahrain', 'OM': 'Oman', 'IN': 'India', 'BR': 'Brazil',
};

// ── World Bank API ──────────────────────────────────
async function fetchWB(indicator, country) {
  const url = `${WORLD_BANK}/country/${country}/indicator/${indicator}?format=json&per_page=10`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    return data[1].filter(d => d.value != null).map(d => ({ year: d.date, value: d.value }));
  } catch (e) { return null; }
}

// ── World Bank Commodity API ─────────────────────────
async function fetchCommodity(code) {
  const url = `${WORLD_BANK}/commodity/pink_sheet/${code}?format=json&per_page=24`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    return data[1].filter(d => d.value != null).map(d => ({
      month: d.date,
      value: d.value,
    }));
  } catch (e) { return null; }
}

// ── ECB Exchange Rates ──────────────────────────────
async function fetchExchangeRates() {
  try {
    const res = await fetch(ECB_RATES, { signal: AbortSignal.timeout(10000) });
    const xml = await res.text();
    const rates = {};
    const matches = xml.matchAll(/Cube currency='([^']+)' rate='([^']+)'/g);
    for (const m of matches) rates[m[1]] = parseFloat(m[2]);
    try {
      const trRes = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
      const trData = await trRes.json();
      if (trData.rates?.TRY) rates.TRY = trData.rates.TRY;
    } catch(e) {}
    return rates;
  } catch (e) { return null; }
}

// ── Alpha Vantage Stock Indices (free tier) ──────────
async function fetchStockIndex(symbol) {
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) return null;
  const url = `${ALPHA_VANTAGE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) return null;
    return {
      symbol,
      price: parseFloat(quote['05. price']),
      change_pct: quote['10. change percent']?.replace('%', '') || null,
    };
  } catch (e) { return null; }
}

// ── UN HDI Data ──────────────────────────────────────
async function fetchHDI() {
  // UNDP Human Development Index — public CSV, no API key
  try {
    const res = await fetch('https://hdr.undp.org/sites/default/files/2023-24_HDR/hdr23-24-composite-data.json', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    const result = {};
    const countryMap = {
      'United States': 'US', 'Turkey': 'TR', 'Germany': 'DE', 'China': 'CN',
      'Japan': 'JP', 'United Kingdom': 'GB', 'Canada': 'CA', 'France': 'FR',
      'Italy': 'IT', 'Korea (Republic of)': 'KR', 'Saudi Arabia': 'SA',
      'United Arab Emirates': 'AE', 'Qatar': 'QA', 'Kuwait': 'KW',
      'India': 'IN', 'Brazil': 'BR',
    };
    for (const entry of data) {
      const code = countryMap[entry.country];
      if (code) {
        result[code] = {
          hdi: entry.hdi_2022 || entry.hdi || null,
          hdi_rank: entry.hdi_rank_2022 || null,
          inequality_hdi: entry.ihdi_2022 || null,
          gender_inequality: entry.gii_2022 || null,
          life_expectancy: entry.le_2022 || null,
          expected_schooling: entry.eys_2022 || null,
          gni_per_capita: entry.gni_pc_2022 || null,
        };
      }
    }
    return result;
  } catch (e) { return null; }
}

// ── Full Country Fetch ───────────────────────────────
async function fetchAllIndicators(country) {
  const results = {};
  for (const [code, info] of Object.entries(ALL_INDICATORS)) {
    const data = await fetchWB(code, country);
    if (data) results[code] = { ...info, data };
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

function buildSummary(indicatorData) {
  const summary = {};
  for (const [code, { cat, label, data }] of Object.entries(indicatorData)) {
    if (data.length === 0) continue;
    const latest = data[0];
    summary[code] = { cat, label, latest_value: latest.value, latest_year: latest.year, trend: data.slice(0, 5).map(d => ({ year: d.year, value: d.value })) };
  }
  return summary;
}

function forecast(summary) {
  const fc = {};
  const growth = summary['NY.GDP.MKTP.KD.ZG']?.trend || [];
  const inflation = summary['FP.CPI.TOTL.ZG']?.trend || [];
  if (growth.length >= 3) fc.gdp_growth_2027 = parseFloat((growth.slice(0,3).reduce((s,d)=>s+d.value,0)/3).toFixed(2));
  if (inflation.length >= 3) fc.inflation_2027 = parseFloat((inflation.slice(0,3).reduce((s,d)=>s+d.value,0)/3).toFixed(2));
  return fc;
}

// ── Main Poll Functions ──────────────────────────────
async function runMacroPoll(country) {
  console.log(`[macroAgent] ${country}...`);
  const [indicators, hdi, rates] = await Promise.all([
    fetchAllIndicators(country),
    fetchHDI(),
    fetchExchangeRates(),
  ]);
  const summary = buildSummary(indicators);
  const fc = forecast(summary);

  return {
    country,
    indicators: summary,
    hdi: hdi?.[country] || null,
    forecast: fc,
    exchange_rates: rates,
    fetched_at: new Date().toISOString(),
  };
}

async function runCommodityPoll() {
  console.log('[macroAgent] Fetching commodity prices...');
  const results = {};
  for (const [code, info] of Object.entries(COMMODITIES)) {
    const data = await fetchCommodity(code);
    if (data) results[code] = { ...info, data };
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(`[macroAgent] ${Object.keys(results).length} commodities loaded`);
  return results;
}

async function runStockPoll() {
  const indices = ['SPY', 'QQQ', 'DIA', 'EWG', 'EWJ', 'FXI', 'TUR', 'EEM'];
  const results = {};
  for (const sym of indices) {
    const data = await fetchStockIndex(sym);
    if (data) results[sym] = data;
    await new Promise(r => setTimeout(r, 15000)); // Alpha Vantage: 5/min free
  }
  return results;
}

// ── Full Report ──────────────────────────────────────
async function runFullMacroReport() {
  console.log('[macroAgent] Starting full report...');
  const db = await getDb();
  const lastLog = db.prepare("SELECT created_at FROM agent_logs WHERE agent_type='macro_agent' AND event='report_complete' ORDER BY created_at DESC LIMIT 1").get();
  if (lastLog) {
    const hoursAgo = (Date.now() - new Date(lastLog.created_at.replace(' ', 'T')).getTime()) / 3600000;
    if (hoursAgo < 12) { console.log(`[macroAgent] Fresh (${hoursAgo.toFixed(1)}h). Skip.`); return { cached: true }; }
  }

  const startTime = Date.now();
  const results = {};

  // Country indicators
  for (const c of TRACKED_COUNTRIES) {
    try { results[c] = await runMacroPoll(c); await new Promise(r => setTimeout(r, 500)); }
    catch (e) { console.error(`[macroAgent] ${c} failed:`, e.message); }
  }

  // Commodities
  try { results._commodities = await runCommodityPoll(); } catch(e) {}

  // Stocks (if key available)
  if (process.env.ALPHA_VANTAGE_KEY) {
    try { results._stocks = await runStockPoll(); } catch(e) {}
  }

  const duration = Date.now() - startTime;

  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'macro_cache.json'), JSON.stringify({ results, updated_at: new Date().toISOString() }));

  db.prepare(`INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at) VALUES (?, 'macro_agent', 'report_complete', ?, ?, 'success', datetime('now'))`).run(uuidv4(), JSON.stringify({ countries: Object.keys(results).filter(k=>!k.startsWith('_')).length, commodities: Object.keys(results._commodities||{}).length }), duration);

  console.log(`[macroAgent] Done in ${Math.round(duration/1000)}s`);
  return results;
}

// ── Schedule ─────────────────────────────────────────
let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  console.log('[macroAgent] Scheduled every 12h');
  runFullMacroReport().catch(e => console.error('[macroAgent] Init:', e));
  pollTimer = setInterval(() => runFullMacroReport().catch(e => console.error('[macroAgent]:', e)), 12*60*60*1000);
}

function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// ── Energy/Fuel Forecasting (Groq AI) ─────────────
async function fuelForecast(country) {
  const groqKey = process.env.GROQ_API_KEY || require('../config').groqApiKey;
  if (!groqKey) return null;

  const prompt = `Current date is May 2026. You are an energy market analyst with deep knowledge of oil markets, geopolitics, OPEC+, and global economics.

Based on your training data and current market conditions:
1. What is the approximate current Brent crude oil price?
2. What is your forecast for Brent crude in late 2027?
3. How will this affect gasoline/diesel prices in Turkey (considering TR inflation ~40%, TRY/USD exchange rate)?

Return ONLY valid JSON (no markdown, no code blocks):
{
  "brent_now": number,
  "brent_2027": number,
  "change_pct": number,
  "reasoning_tr": "2-3 sentence Turkish analysis of what drives this forecast",
  "turkey_impact_tr": "1-2 sentence Turkish: how this affects fuel prices in Turkey",
  "advice_tr": "1 sentence Turkish investment/procurement advice"
}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 400, temperature: 0.3 }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const json = text.match(/\{[\s\S]*\}/);
    return json ? JSON.parse(json[0]) : null;
  } catch (e) { return null; }
}

// ── RSS News Feeds ───────────────────────────────
// Completely free, no API keys, no registration
const RSS_FEEDS = {
  'Reuters Business': 'https://feeds.reuters.com/reuters/businessNews',
  'BBC Business': 'http://feeds.bbci.co.uk/news/business/rss.xml',
  'Anadolu Ajansı Ekonomi': 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi',
  'Al Jazeera Economy': 'https://www.aljazeera.com/xml/rss/all.xml',
  'CNBC Top News': 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'Bloomberg': 'https://feeds.bloomberg.com/markets/news.rss',
};

async function fetchRSS(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const content = match[1];
      const title = (content.match(/<title>(.*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
      const link = (content.match(/<link>(.*?)<\/link>/) || [])[1] || '';
      const desc = (content.match(/<description>(.*?)<\/description>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.substring(0, 200) || '';
      const pubDate = (content.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
      items.push({ title: title.replace(/<[^>]*>/g, ''), link, description: desc.replace(/<[^>]*>/g, ''), pubDate });
    }
    return items;
  } catch (e) { return []; }
}

async function runRSSNews(sources = ['Reuters Business', 'BBC Business', 'Bloomberg']) {
  const all = [];
  for (const name of sources) {
    const url = RSS_FEEDS[name];
    if (!url) continue;
    console.log(`[macroAgent] Fetching RSS: ${name}`);
    const items = await fetchRSS(url);
    all.push({ source: name, items: items.slice(0, 5) });
    await new Promise(r => setTimeout(r, 500));
  }
  return all;
}

module.exports = { runMacroPoll, runCommodityPoll, runFullMacroReport, runRSSNews, fuelForecast, startPolling, stopPolling, TRACKED_COUNTRIES, ALL_INDICATORS, COMMODITIES, GULF_COUNTRIES, RSS_FEEDS };
