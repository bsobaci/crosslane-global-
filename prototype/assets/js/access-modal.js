// Crosslane Global — Access Request Modal
// Qualification form with honeypot, business email validation, corporate styling

class AccessModal {
  constructor() {
    this.opportunityId = null;
    this.opportunityTitle = '';
    this.modal = null;
    this._buildModal();
  }

  _buildModal() {
    // Create modal DOM once and keep it hidden
    const overlay = document.createElement('div');
    overlay.className = 'qual-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="qual-modal" role="dialog" aria-labelledby="qual-title" aria-modal="true">
        <button class="qual-close" aria-label="Close">&times;</button>
        <div class="qual-header">
          <span class="qual-eyebrow">Procurement Intelligence Division</span>
          <h2 id="qual-title">Request Access</h2>
          <p class="qual-opp-title"></p>
        </div>
        <div class="qual-body">
          <p class="qual-intro">Qualified companies and institutional investors only. Your access request will be reviewed by our procurement intelligence team within 24 hours.</p>

          <form id="qualForm" class="qual-form" novalidate>
            <!-- Honeypot fields — invisible to humans -->
            <input type="text" name="_website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <input type="text" name="_contact" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <input type="email" name="_email_backup" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true" />

            <div class="qual-field">
              <label for="qual_name">Full Name *</label>
              <input type="text" id="qual_name" name="full_name" required minlength="2" autocomplete="name" />
              <span class="qual-err"></span>
            </div>
            <div class="qual-field">
              <label for="qual_title">Job Title *</label>
              <input type="text" id="qual_title" name="job_title" required minlength="2" autocomplete="organization-title" />
              <span class="qual-err"></span>
            </div>
            <div class="qual-field">
              <label for="qual_company">Registered Company Name *</label>
              <input type="text" id="qual_company" name="company_name" required minlength="2" autocomplete="organization" />
              <span class="qual-err"></span>
            </div>
            <div class="qual-field">
              <label for="qual_email">Business Email *</label>
              <input type="email" id="qual_email" name="business_email" required autocomplete="email" placeholder="you@yourcompany.com" />
              <span class="qual-err" data-default="Corporate email required. Gmail, Yahoo, Hotmail not accepted."></span>
            </div>
            <div class="qual-field">
              <label for="qual_phone">Corporate Phone</label>
              <input type="tel" id="qual_phone" name="phone" autocomplete="tel" placeholder="+1 (555) 000-0000" />
              <span class="qual-err"></span>
            </div>
            <div class="qual-field">
              <label for="qual_industry">Industry</label>
              <input type="text" id="qual_industry" name="industry" placeholder="e.g. Construction, IT, Defense" />
            </div>
            <div class="qual-field">
              <label for="qual_website">Company Website URL</label>
              <input type="url" id="qual_website" name="website_url" placeholder="https://www.yourcompany.com" />
              <span class="qual-err"></span>
            </div>
            <div class="qual-field">
              <label for="qual_size">Estimated Company Size</label>
              <select id="qual_size" name="company_size">
                <option value="">— Select —</option>
                <option value="1-10">1–10 employees</option>
                <option value="11-50">11–50 employees</option>
                <option value="51-200">51–200 employees</option>
                <option value="201-1000">201–1,000 employees</option>
                <option value="1000+">1,000+ employees</option>
              </select>
            </div>
            <div class="qual-field qual-full">
              <label for="qual_interests">Areas of Interest</label>
              <textarea id="qual_interests" name="areas_of_interest" rows="2" placeholder="e.g. US Federal IT Contracts, Canadian Infrastructure Bids, Real Estate Investment"></textarea>
            </div>

            <div class="qual-submit-row">
              <p class="qual-disclaimer">By submitting, you confirm you are an authorized representative of the named company. Access is granted at the sole discretion of Crosslane Global and may require NDA execution.</p>
              <button type="submit" class="qual-submit">
                <span class="qual-submit-text">Submit Access Request</span>
                <span class="qual-submit-spinner" style="display:none"></span>
              </button>
            </div>

            <div class="qual-success" style="display:none">
              <div class="qual-success-icon">&#10003;</div>
              <h3>Request Submitted</h3>
              <p>Thank you. Your access request for <strong class="qual-success-title"></strong> has been received and is currently being reviewed by our procurement intelligence team. If approved, detailed specifications and NDA procedures will be shared within 24 hours.</p>
            </div>

            <div class="qual-error-banner" style="display:none"></div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modal = overlay;
    this._wireEvents();
  }

  _wireEvents() {
    // Close on overlay click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Close button
    this.modal.querySelector('.qual-close').addEventListener('click', () => this.close());

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.getAttribute('aria-hidden') === 'false') {
        this.close();
      }
    });

    // Form submit
    const form = this.modal.querySelector('#qualForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit();
    });

    // Clear errors on input
    form.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', () => {
        el.closest('.qual-field')?.querySelector('.qual-err')?.classList.remove('visible');
        el.classList.remove('qual-input-err');
      });
    });
  }

  open(opportunityId, opportunityTitle) {
    this.opportunityId = opportunityId;
    this.opportunityTitle = opportunityTitle;
    this.modal.querySelector('.qual-opp-title').textContent = opportunityTitle || '';
    this._resetForm();
    this.modal.setAttribute('aria-hidden', 'false');
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    // Focus first input
    setTimeout(() => this.modal.querySelector('#qual_name').focus(), 100);
  }

  close() {
    this.modal.setAttribute('aria-hidden', 'true');
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  _resetForm() {
    const form = this.modal.querySelector('#qualForm');
    form.reset();
    form.querySelectorAll('.qual-err').forEach(el => el.classList.remove('visible'));
    form.querySelectorAll('.qual-input-err').forEach(el => el.classList.remove('qual-input-err'));
    this.modal.querySelector('.qual-submit-row').style.display = '';
    this.modal.querySelector('.qual-success').style.display = 'none';
    this.modal.querySelector('.qual-error-banner').style.display = 'none';
    this.modal.querySelector('.qual-submit-text').style.display = '';
    this.modal.querySelector('.qual-submit-spinner').style.display = 'none';
    this.modal.querySelector('.qual-submit').disabled = false;
  }

  async _handleSubmit() {
    const form = this.modal.querySelector('#qualForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Clear previous errors
    form.querySelectorAll('.qual-err').forEach(el => el.classList.remove('visible'));
    form.querySelectorAll('.qual-input-err').forEach(el => el.classList.remove('qual-input-err'));
    const errorBanner = this.modal.querySelector('.qual-error-banner');
    errorBanner.style.display = 'none';

    // Basic client-side validation
    const clientErrors = [];
    const requiredFields = [
      { name: 'full_name', label: 'Full Name' },
      { name: 'job_title', label: 'Job Title' },
      { name: 'company_name', label: 'Company Name' },
      { name: 'business_email', label: 'Business Email' },
    ];

    for (const { name, label } of requiredFields) {
      if (!data[name] || data[name].trim().length < 2) {
        clientErrors.push({ field: name, message: `${label} is required.` });
      }
    }

    if (clientErrors.length > 0) {
      this._showErrors(clientErrors);
      return;
    }

    // Show spinner
    this.modal.querySelector('.qual-submit-text').style.display = 'none';
    this.modal.querySelector('.qual-submit-spinner').style.display = 'inline-block';
    this.modal.querySelector('.qual-submit').disabled = true;

    try {
      const result = await api.submitLead({
        ...data,
        opportunity_id: this.opportunityId,
      });

      // Success — show confirmation
      this.modal.querySelector('.qual-submit-row').style.display = 'none';
      const success = this.modal.querySelector('.qual-success');
      success.querySelector('.qual-success-title').textContent = this.opportunityTitle || 'the selected opportunity';
      success.style.display = 'block';

      // Store access token (for future full-detail unlock)
      if (result.access_token) {
        try {
          localStorage.setItem('cg-access-token', result.access_token);
        } catch (e) { /* ignore */ }
      }
    } catch (err) {
      // Show spinner again
      this.modal.querySelector('.qual-submit-text').style.display = '';
      this.modal.querySelector('.qual-submit-spinner').style.display = 'none';
      this.modal.querySelector('.qual-submit').disabled = false;

      if (err.errors && Array.isArray(err.errors)) {
        this._showErrors(err.errors);
      } else {
        errorBanner.textContent = err.message || 'An error occurred. Please try again.';
        errorBanner.style.display = 'block';
      }
    }
  }

  _showErrors(errors) {
    const form = this.modal.querySelector('#qualForm');
    for (const err of errors) {
      const el = form.querySelector(`[name="${err.field}"]`);
      if (el) {
        el.classList.add('qual-input-err');
        const errSpan = el.closest('.qual-field')?.querySelector('.qual-err');
        if (errSpan) {
          errSpan.textContent = err.message;
          errSpan.classList.add('visible');
        }
      }
    }
  }
}

// Singleton
const accessModal = new AccessModal();

// Auto-wire all "Request Access" CTAs on the page
function wireAccessButtons() {
  document.querySelectorAll('[data-access-btn]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const oppId = btn.getAttribute('data-access-id');
      const oppTitle = btn.getAttribute('data-access-title');
      accessModal.open(oppId, oppTitle);
    });
  });
}

// Wire on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAccessButtons);
} else {
  wireAccessButtons();
}
