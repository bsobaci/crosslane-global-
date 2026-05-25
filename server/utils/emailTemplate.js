function buildAccessRequestEmail(data) {
  const { fullName, opportunityTitle, token } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin: 0; padding: 0; background: #f4f3f0; font-family: 'Georgia', 'Times New Roman', serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border: 1px solid #e8e4dc; border-radius: 3px; overflow: hidden; }
    .header { background: #1a1a1a; padding: 40px 48px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 24px; font-weight: 500; margin: 0; font-family: 'Georgia', serif; }
    .header .accent { color: #B87A2A; }
    .header .tagline { color: rgba(255,255,255,0.55); font-size: 13px; margin-top: 8px; letter-spacing: 0.04em; }
    .body { padding: 40px 48px; }
    .body p { color: #444; font-size: 15px; line-height: 1.8; margin: 0 0 20px; }
    .body .name { color: #1a1a1a; font-weight: 600; }
    .opp-box { background: #faf9f7; border: 1px solid #e8e4dc; border-left: 3px solid #B87A2A; padding: 20px 24px; margin: 24px 0; border-radius: 2px; }
    .opp-box .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #B87A2A; font-weight: 600; margin-bottom: 6px; }
    .opp-box .title { font-size: 17px; color: #1a1a1a; font-weight: 600; }
    .next-steps { background: #1a1a1a; padding: 28px 48px; }
    .next-steps p { color: rgba(255,255,255,0.6); font-size: 13px; line-height: 1.7; margin: 0 0 16px; }
    .next-steps strong { color: #ffffff; display: block; margin-bottom: 6px; font-size: 14px; }
    .footer { padding: 24px 48px; text-align: center; border-top: 1px solid #e8e4dc; }
    .footer p { font-size: 12px; color: #999; margin: 0; line-height: 1.6; }
    .footer .brand { color: #1a1a1a; font-weight: 600; }
    .footer .brand span { color: #B87A2A; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Crosslane <span class="accent">Global</span></h1>
      <div class="tagline">Procurement Intelligence Division</div>
    </div>
    <div class="body">
      <p>Dear <span class="name">${fullName}</span>,</p>
      <p>Thank you for your interest. Your access request for the following opportunity has been received and is currently being reviewed by our procurement intelligence team.</p>
      <div class="opp-box">
        <div class="label">Requested Opportunity</div>
        <div class="title">${opportunityTitle}</div>
      </div>
      <p>If approved, detailed specifications, qualification documents, and NDA procedures will be shared within 24 hours. Our team evaluates every request individually to ensure access is granted to qualified companies and institutional investors.</p>
      <p>Should your organization be verified and approved, you will receive a secure link to the full opportunity dossier, including solicitation numbers, technical specifications, and direct procurement contact information.</p>
    </div>
    <div class="next-steps">
      <strong>What happens next:</strong>
      <p>1. Our team reviews your company profile and qualification details.</p>
      <p>2. If eligible, you receive an access token and NDA documentation within 24 hours.</p>
      <p>3. Full opportunity details are unlocked upon NDA execution.</p>
    </div>
    <div class="footer">
      <p class="brand">Crosslane <span>Global</span></p>
      <p>Tysons Corner, Virginia &mdash; Washington D.C. Metro Area</p>
      <p>This is an automated confirmation. Replies to this address are not monitored.<br/>For assistance, contact hello@crosslaneglobal.com</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildAccessRequestEmail };
