-- Crosslane Global — Enterprise Database Schema

CREATE TABLE IF NOT EXISTS opportunities (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  industry        TEXT,
  naics_code      TEXT,
  region          TEXT NOT NULL DEFAULT 'US',
  budget_min      INTEGER,
  budget_max      INTEGER,
  currency        TEXT DEFAULT 'USD',
  procurement_category TEXT,
  opportunity_type    TEXT,
  deadline        TEXT,
  executive_summary_en TEXT,
  executive_summary_tr TEXT,

  -- Public-safe display location (state/province level only)
  location_display     TEXT,
  -- Cross-border: where the work is physically performed (country)
  execution_country    TEXT,
  -- Issuing government country (denormalized from region for clarity)
  issuing_country      TEXT,

  -- Hidden until verified access
  solicitation_number  TEXT,
  agency_name          TEXT,
  performance_location TEXT,
  source_url           TEXT,

  source          TEXT DEFAULT 'manual',
  source_id       TEXT,
  status          TEXT DEFAULT 'draft',
  featured        INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT REFERENCES opportunities(id),

  full_name       TEXT NOT NULL,
  job_title       TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  business_email  TEXT NOT NULL,
  phone           TEXT,
  industry        TEXT,
  website_url     TEXT,
  company_size    TEXT,
  areas_of_interest TEXT,

  verification_status TEXT DEFAULT 'pending',
  ip_address      TEXT,
  user_agent      TEXT,

  is_duplicate    INTEGER DEFAULT 0,
  honeypot_triggered INTEGER DEFAULT 0,

  access_granted_at    TEXT,
  access_token         TEXT,
  email_sent_at        TEXT,
  webhook_fired_at     TEXT,

  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id              TEXT PRIMARY KEY,
  agent_type      TEXT NOT NULL,
  event           TEXT NOT NULL,
  details         TEXT,
  tokens_used     INTEGER,
  duration_ms     INTEGER,
  status          TEXT DEFAULT 'success',
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opps_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opps_deadline ON opportunities(deadline);
CREATE INDEX IF NOT EXISTS idx_opps_region ON opportunities(region);
CREATE INDEX IF NOT EXISTS idx_opps_featured ON opportunities(featured);
CREATE INDEX IF NOT EXISTS idx_opps_category ON opportunities(procurement_category);
CREATE INDEX IF NOT EXISTS idx_opps_location ON opportunities(location_display);
CREATE INDEX IF NOT EXISTS idx_opps_budget ON opportunities(budget_min, budget_max);
CREATE INDEX IF NOT EXISTS idx_opps_source ON opportunities(source);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(business_email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(verification_status);
CREATE INDEX IF NOT EXISTS idx_leads_opp ON leads(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_agent_type ON agent_logs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_created ON agent_logs(created_at);
