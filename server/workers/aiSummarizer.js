// Groq AI Summarizer — Free tier, 30 req/min, OpenAI-compatible
// Generates bilingual EN/TR executive summaries for procurement opportunities

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const config = require('../config');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile'; // Free, fast, good Turkish

const SYSTEM_PROMPT = `You are a senior procurement analyst at Crosslane Global, an elite government contracting advisory firm.

Analyze the given tender and write TWO brief executive summaries — one in English, one in Turkish.

Return ONLY this exact JSON format, no other text:
{"en":"English summary here","tr":"Turkish summary here"}

Rules:
- EN: 2-3 sentences. What is being procured, by whom, budget, who should bid.
- TR: 2-3 sentences. Professional business Turkish. Same substance.
- Be precise. No markdown. No speculation.`;

async function generateSummary(opportunity) {
  const apiKey = config.groqApiKey;
  if (!apiKey) {
    console.log('[aiSummarizer] No Groq key. Using fallback.');
    return fallbackSummary(opportunity);
  }

  const prompt = JSON.stringify({
    title: opportunity.title,
    sector: opportunity.procurement_category || opportunity.industry || 'Unknown',
    naics: opportunity.naics_code || 'N/A',
    budget: opportunity.budget_min && opportunity.budget_max
      ? `$${(opportunity.budget_min / 1e6).toFixed(1)}M - $${(opportunity.budget_max / 1e6).toFixed(1)}M`
      : 'Not specified',
    deadline: opportunity.deadline || 'Not specified',
    agency: opportunity.agency_name || 'Not disclosed',
  });

  const startTime = Date.now();
  const db = await getDb();

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 350,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const duration = Date.now() - startTime;
    const tokens = data.usage?.total_tokens || 0;

    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, tokens_used, duration_ms, status, created_at)
      VALUES (?, 'ai_summarizer', 'summary_generated', ?, ?, ?, 'success', datetime('now'))
    `).run(uuidv4(), JSON.stringify({ title: opportunity.title?.substring(0, 80) }), tokens, duration);

    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.en && parsed.tr) return { en: parsed.en, tr: parsed.tr };
    }
    return { en: text.slice(0, 300), tr: '' };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[aiSummarizer] Groq error: ${err.message}`);
    db.prepare(`
      INSERT INTO agent_logs (id, agent_type, event, details, duration_ms, status, created_at)
      VALUES (?, 'ai_summarizer', 'summary_error', ?, ?, 'error', datetime('now'))
    `).run(uuidv4(), JSON.stringify({ error: err.message }), duration);
    return fallbackSummary(opportunity);
  }
}

function fallbackSummary(opp) {
  const budgetStr = opp.budget_min && opp.budget_max
    ? `$${(opp.budget_min / 1e6).toFixed(1)}M - $${(opp.budget_max / 1e6).toFixed(1)}M`
    : 'Not specified';
  const d = opp.deadline ? new Date(opp.deadline + 'T00:00:00') : null;
  const dateStr = d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const dateStrTr = d ? d.toLocaleDateString('tr-TR', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const en = `${opp.procurement_category || 'Procurement'} opportunity${opp.agency_name ? ' from ' + opp.agency_name : ''}. Budget: ${budgetStr}.${dateStr ? ' Deadline: ' + dateStr + '.' : ''}`;
  const tr = `${opp.procurement_category || 'Tedarik'} fırsatı${opp.agency_name ? ' - ' + opp.agency_name : ''}. Bütçe: ${budgetStr}.${dateStrTr ? ' Son tarih: ' + dateStrTr + '.' : ''}`;
  return { en, tr };
}

module.exports = { generateSummary };
