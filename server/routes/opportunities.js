const { Router } = require('express');
const { getDb } = require('../db/connection');

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

// Build WHERE clause from filter params
function buildFilters(query) {
  const conditions = [];
  const params = [];

  // Only published for public API
  conditions.push('status = ?');
  params.push('published');
  // Only show opportunities with budget data (marketing teasers)
  conditions.push('budget_min IS NOT NULL AND budget_max IS NOT NULL');

  // Country / Region filter (issuing government)
  if (query.region) {
    conditions.push('region = ?');
    params.push(query.region);
  }

  // Cross-border: filter by execution country (where work happens)
  if (query.executionCountry) {
    conditions.push('execution_country = ?');
    params.push(query.executionCountry);
  }

  // Cross-border: filter by issuing country
  if (query.issuingCountry) {
    conditions.push('issuing_country = ?');
    params.push(query.issuingCountry);
  }

  // Sector / Category filter
  if (query.sector) {
    conditions.push('procurement_category = ?');
    params.push(query.sector);
  }

  // Location filter (state/province level, public-safe)
  if (query.location) {
    conditions.push('location_display LIKE ?');
    params.push(`%${query.location}%`);
  }

  // Budget range filter
  if (query.budgetMin) {
    conditions.push('(budget_max >= ? OR budget_max IS NULL)');
    params.push(parseInt(query.budgetMin, 10));
  }
  if (query.budgetMax) {
    conditions.push('(budget_min <= ? OR budget_min IS NULL)');
    params.push(parseInt(query.budgetMax, 10));
  }

  // Deadline filter
  if (query.deadlineBefore) {
    conditions.push('deadline <= ?');
    params.push(query.deadlineBefore);
  }
  if (query.deadlineAfter) {
    conditions.push('deadline >= ?');
    params.push(query.deadlineAfter);
  }

  // Search in title
  if (query.search) {
    conditions.push('title LIKE ?');
    params.push(`%${query.search}%`);
  }

  // Featured only
  if (query.featured === '1') {
    conditions.push('featured = 1');
  }

  return { conditions, params };
}

// GET /api/opportunities — public list (summarized, no hidden fields)
router.get('/', withDb(async (req, res, _next, db) => {
  const { conditions, params } = buildFilters(req.query);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let sql = `SELECT id, title, industry, naics_code, region, location_display,
                    execution_country, issuing_country,
                    budget_min, budget_max, currency,
                    procurement_category, opportunity_type, deadline,
                    executive_summary_en, executive_summary_tr,
                    source, status, featured, created_at, updated_at
             FROM opportunities ${where}`;

  // Sorting
  const sort = req.query.sort || 'featured';
  if (sort === 'deadline') sql += ' ORDER BY deadline ASC';
  else if (sort === 'budget') sql += ' ORDER BY budget_max DESC';
  else if (sort === 'newest') sql += ' ORDER BY created_at DESC';
  else sql += ' ORDER BY featured DESC, deadline ASC';

  // Count
  const countSql = sql.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
  const countDbParams = [...params];

  // Pagination
  const pageLimit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const pageOffset = parseInt(req.query.offset, 10) || 0;
  sql += ' LIMIT ? OFFSET ?';
  const allParams = [...params, pageLimit, pageOffset];

  const rows = db.prepare(sql).all(...allParams);
  const countRow = db.prepare(countSql).get(...countDbParams);
  const total = countRow ? countRow.total : 0;

  // Public-safe mapping — ensure no hidden fields leak
  const safe = rows.map(r => ({
    id: r.id,
    title: r.title,
    industry: r.industry,
    naics_code: r.naics_code,
    region: r.region,
    location_display: r.location_display,
    execution_country: r.execution_country,
    issuing_country: r.issuing_country,
    budget_min: r.budget_min,
    budget_max: r.budget_max,
    currency: r.currency,
    procurement_category: r.procurement_category,
    opportunity_type: r.opportunity_type,
    deadline: r.deadline,
    executive_summary_en: r.executive_summary_en,
    executive_summary_tr: r.executive_summary_tr,
    source: r.source,
    status: r.status,
    featured: r.featured,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  res.json({ opportunities: safe, total, limit: pageLimit, offset: pageOffset });
}));

// GET /api/opportunities/teaser — aggregate market stats (public)
router.get('/teaser', withDb(async (_req, res, _next, db) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status='published'").get();
  const totalValue = db.prepare("SELECT COALESCE(SUM(budget_max), 0) as total FROM opportunities WHERE status='published'").get();
  const sectors = db.prepare(
    `SELECT procurement_category as name, COUNT(*) as count
     FROM opportunities WHERE status='published' AND procurement_category IS NOT NULL
     GROUP BY procurement_category ORDER BY count DESC LIMIT 5`
  ).all();
  const topSector = sectors[0]?.name || 'Defense & IT';
  const countries = db.prepare(
    `SELECT execution_country as name, COUNT(*) as count
     FROM opportunities WHERE status='published' AND execution_country IS NOT NULL
     GROUP BY execution_country ORDER BY count DESC LIMIT 10`
  ).all();
  const issuingCountries = db.prepare(
    `SELECT issuing_country as name, COUNT(*) as count
     FROM opportunities WHERE status='published' AND issuing_country IS NOT NULL
     GROUP BY issuing_country ORDER BY count DESC`
  ).all();

  // Cross-border count: execution country != issuing country
  const crossBorder = db.prepare(
    `SELECT COUNT(*) as c FROM opportunities WHERE status='published'
     AND execution_country IS NOT NULL AND issuing_country IS NOT NULL
     AND execution_country != issuing_country`
  ).get();

  res.json({
    total_opportunities: total?.c || 0,
    total_value_usd: totalValue?.total || 0,
    top_sector: topSector,
    sectors,
    execution_countries: countries,
    issuing_countries: issuingCountries,
    cross_border_contracts: crossBorder?.c || 0,
    coming_soon: true,
    message: 'Full dataset coming soon. API integration in progress — global federal + municipal coverage.',
  });
}));

// GET /api/opportunities/filters — available filter options
router.get('/filters', withDb(async (req, res, _next, db) => {
  const regionFilter = req.query.region || null;

  let regionWhere = "WHERE status = 'published'";
  const rp = [];
  if (regionFilter) {
    regionWhere += ' AND region = ?';
    rp.push(regionFilter);
  }

  // Available sectors
  const sectors = db.prepare(
    `SELECT DISTINCT procurement_category as name, COUNT(*) as count
     FROM opportunities ${regionWhere}
     GROUP BY procurement_category ORDER BY count DESC LIMIT 30`
  ).all(...rp);

  // Available locations (public-safe)
  const locations = db.prepare(
    `SELECT DISTINCT location_display as name, COUNT(*) as count
     FROM opportunities ${regionWhere} AND location_display IS NOT NULL
     GROUP BY location_display ORDER BY count DESC LIMIT 30`
  ).all(...rp);

  // Budget ranges (predefined brackets)
  const budgetBrackets = [
    { label: 'Under $100K', min: 0, max: 100000 },
    { label: '$100K – $500K', min: 100000, max: 500000 },
    { label: '$500K – $1M', min: 500000, max: 1000000 },
    { label: '$1M – $5M', min: 1000000, max: 5000000 },
    { label: '$5M – $25M', min: 5000000, max: 25000000 },
    { label: '$25M+', min: 25000000, max: null },
  ];

  // Count per bracket
  const budgetCounts = budgetBrackets.map(b => {
    const whereParts = ["status = 'published'"];
    const bp = [];
    if (regionFilter) { whereParts.push('region = ?'); bp.push(regionFilter); }
    whereParts.push('budget_max >= ?');
    bp.push(b.min);
    if (b.max) { whereParts.push('budget_min <= ?'); bp.push(b.max); }
    const count = db.prepare(
      `SELECT COUNT(*) as c FROM opportunities WHERE ${whereParts.join(' AND ')}`
    ).get(...bp);
    return { ...b, count: count?.c || 0 };
  });

  res.json({
    sectors,
    locations,
    budget_brackets: budgetCounts,
    regions: [
      { name: 'US', label: 'United States', count: db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status='published' AND region='US'").get()?.c || 0 },
      { name: 'Canada', label: 'Canada', count: db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE status='published' AND region='Canada'").get()?.c || 0 },
    ],
  });
}));

// GET /api/opportunities/macro — economic indicators & reports
router.get('/macro', withDb(async (req, res, _next, _db) => {
  const fs = require('fs');
  const path = require('path');
  const cachePath = path.join(__dirname, '..', 'data', 'macro_cache.json');

  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const country = req.query.country || null;
    if (country && cache.results && cache.results[country]) {
      return res.json({ country: cache.results[country], updated_at: cache.updated_at });
    }
    return res.json(cache);
  }

  const { runMacroPoll } = require('../workers/macroAgent');
  const country = req.query.country || 'TR';
  const data = await runMacroPoll(country);
  res.json({ country: data, updated_at: data.fetched_at });
}));

// GET /api/opportunities/:id — single public opportunity
router.get('/:id', withDb(async (req, res, _next, db) => {
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ? AND status = ?').get(req.params.id, 'published');
  if (!row) return res.status(404).json({ error: 'Opportunity not found.' });

  res.json({
    id: row.id,
    title: row.title,
    industry: row.industry,
    naics_code: row.naics_code,
    region: row.region,
    location_display: row.location_display,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    currency: row.currency,
    procurement_category: row.procurement_category,
    opportunity_type: row.opportunity_type,
    deadline: row.deadline,
    executive_summary_en: row.executive_summary_en,
    executive_summary_tr: row.executive_summary_tr,
    source: row.source,
    status: row.status,
    featured: row.featured,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}));

// GET /api/opportunities/:id/full — full detail (requires access token)
router.get('/:id/full', withDb(async (req, res, _next, db) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required to unlock full opportunity details.' });
  }

  const token = authHeader.slice(7);
  const lead = db.prepare(
    `SELECT * FROM leads WHERE access_token = ? AND verification_status = 'approved' AND opportunity_id = ?`
  ).get(token, req.params.id);

  if (!lead) {
    return res.status(403).json({ error: 'Invalid or expired access token. Please submit a new access request.' });
  }

  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Opportunity not found.' });

  res.json({
    id: row.id,
    title: row.title,
    industry: row.industry,
    naics_code: row.naics_code,
    region: row.region,
    location_display: row.location_display,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    currency: row.currency,
    procurement_category: row.procurement_category,
    opportunity_type: row.opportunity_type,
    deadline: row.deadline,
    executive_summary_en: row.executive_summary_en,
    executive_summary_tr: row.executive_summary_tr,
    // Hidden — only with valid token
    solicitation_number: row.solicitation_number,
    agency_name: row.agency_name,
    performance_location: row.performance_location,
    source: row.source,
    source_id: row.source_id,
    source_url: row.source_url,
    status: row.status,
    featured: row.featured,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}));

module.exports = router;
