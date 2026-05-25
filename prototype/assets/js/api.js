// Crosslane Global — API Client
// All fetch() wrappers for the backend API

const API_BASE = '/api';

const api = {
  async getOpportunities(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/opportunities${qs ? '?' + qs : ''}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load opportunities');
    }
    return res.json();
  },

  async getOpportunity(id) {
    const res = await fetch(`${API_BASE}/opportunities/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Opportunity not found');
    }
    return res.json();
  },

  async getFullOpportunity(id, accessToken) {
    const res = await fetch(`${API_BASE}/opportunities/${encodeURIComponent(id)}/full`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Access denied');
    }
    return res.json();
  },

  async submitLead(data) {
    const res = await fetch(`${API_BASE}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) {
      throw body; // { errors: [...] }
    }
    return body;
  },
};
