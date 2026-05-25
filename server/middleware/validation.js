const validator = require('validator');
const config = require('../config');

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return validator.escape(validator.trim(str));
}

function validateLeadInput(body) {
  const errors = [];

  // Full Name
  const fullName = sanitize(body.full_name || '');
  if (!fullName || fullName.length < 2) {
    errors.push({ field: 'full_name', message: 'Full name is required (minimum 2 characters).' });
  }

  // Job Title
  const jobTitle = sanitize(body.job_title || '');
  if (!jobTitle || jobTitle.length < 2) {
    errors.push({ field: 'job_title', message: 'Job title is required.' });
  }

  // Company Name
  const companyName = sanitize(body.company_name || '');
  if (!companyName || companyName.length < 2) {
    errors.push({ field: 'company_name', message: 'Registered company name is required.' });
  }

  // Business Email — strict validation
  const email = sanitize(body.business_email || '');
  if (!email || !validator.isEmail(email)) {
    errors.push({ field: 'business_email', message: 'A valid business email address is required.' });
  } else {
    const domain = email.split('@')[1]?.toLowerCase();
    if (config.blockedEmailDomains.includes(domain)) {
      errors.push({
        field: 'business_email',
        message: 'Please use your corporate email address. Public email domains (Gmail, Yahoo, etc.) are not accepted.',
      });
    }
  }

  // Phone (optional but validated if provided)
  const phone = sanitize(body.phone || '');
  if (phone && !validator.isMobilePhone(phone, 'any', { strictMode: false })) {
    errors.push({ field: 'phone', message: 'Please enter a valid corporate phone number.' });
  }

  // Website URL (optional)
  const websiteUrl = sanitize(body.website_url || '');
  if (websiteUrl && !validator.isURL(websiteUrl, { require_protocol: false })) {
    errors.push({ field: 'website_url', message: 'Please enter a valid company website URL.' });
  }

  // Honeypot check — if filled, silently reject (bot detected)
  if (body._website || body._contact || body._email_backup) {
    return { errors: [], honeypotTriggered: true, sanitized: null };
  }

  const sanitized = {
    full_name: fullName,
    job_title: jobTitle,
    company_name: companyName,
    business_email: email,
    opportunity_id: sanitize(body.opportunity_id || ''),
    phone,
    industry: sanitize(body.industry || ''),
    website_url: websiteUrl,
    company_size: sanitize(body.company_size || ''),
    areas_of_interest: sanitize(body.areas_of_interest || ''),
  };

  return { errors, honeypotTriggered: false, sanitized };
}

module.exports = { sanitize, validateLeadInput };
