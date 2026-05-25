// Crosslane Global — Prototype shared JS
// Injects shared nav/footer, handles language toggle and scroll-state nav

(function () {
  const NAV_LINKS = [
    { href: 'about.html', en: 'About', tr: 'Hakkımızda' },
    { href: 'services.html', en: 'Services', tr: 'Hizmetler' },
    { href: 'why-us-canada.html', en: 'Our Markets', tr: 'Pazarlarımız' },
    { href: 'opportunities.html', en: 'Opportunities', tr: 'Fırsatlar' },
    { href: 'insights.html', en: 'Insights', tr: 'İçgörüler' },
    { href: 'partners.html', en: 'Partners', tr: 'İş Ortakları' },
    { href: 'investor-visas.html', en: 'Visa & Tax', tr: 'Vize & Vergi' }
  ];

  // Determine relative base for pages inside /services/
  const base = location.pathname.includes('/services/') && !location.pathname.endsWith('/services.html')
    ? '../'
    : '';

  function buildNav() {
    const links = NAV_LINKS.map(l =>
      `<li><a href="${base}${l.href}"><span data-en>${l.en}</span><span data-tr>${l.tr}</span></a></li>`
    ).join('');

    return `
      <a href="#main-content" class="skip-link">Skip to content</a>
      <nav class="nav" id="mainNav" aria-label="Main navigation">
        <div class="nav-inner">
          <a href="${base}index.html" class="nav-logo" aria-label="Crosslane Global Home">Crosslane <span class="accent">Global</span></a>
          <ul class="nav-links" role="list">${links}</ul>
          <div class="nav-right">
            <div class="lang-toggle">
              <button data-set-lang="en" class="active">EN</button>
              <span class="sep">/</span>
              <button data-set-lang="tr">TR</button>
            </div>
            <a href="${base}contact.html" class="nav-cta">
              <span data-en>Get in Touch</span><span data-tr>İletişim</span>
            </a>
            <button class="nav-toggle" aria-label="Menu">☰</button>
          </div>
        </div>
      </nav>`;
  }

  function buildFooter() {
    return `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <div class="footer-logo">Crosslane <span style="color:var(--gold)">Global</span></div>
              <p data-en>Your bridge to North American markets — investment, capital structuring, and government contracting advisory for international investors.</p>
              <p data-tr>Kuzey Amerika pazarlarına köprünüz. Uluslararası yatırımcılar için yatırım, sermaye yapılandırma ve kamu ihale danışmanlığı.</p>
            </div>
            <div class="footer-col">
              <h5><span data-en>Services</span><span data-tr>Hizmetler</span></h5>
              <ul>
                <li><a href="${base}services/investment.html"><span data-en>Investment & Real Estate</span><span data-tr>Yatırım & Gayrimenkul</span></a></li>
                <li><a href="${base}services/company-setup.html"><span data-en>Company Formation</span><span data-tr>Şirket Kurma</span></a></li>
                <li><a href="${base}services/relocation.html"><span data-en>Relocation</span><span data-tr>Yerleşim</span></a></li>
                <li><a href="${base}services/gov-contracting.html"><span data-en>Government Contracting</span><span data-tr>Kamu İhaleleri</span></a></li>
                <li><a href="${base}services/proposal-writing.html"><span data-en>Proposal Writing</span><span data-tr>Teklif Hazırlama</span></a></li>
                <li><a href="${base}services/advisory.html"><span data-en>Strategic Advisory</span><span data-tr>Stratejik Danışmanlık</span></a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h5><span data-en>Company</span><span data-tr>Firma</span></h5>
              <ul>
                <li><a href="${base}about.html"><span data-en>About</span><span data-tr>Hakkımızda</span></a></li>
                <li><a href="${base}why-us-canada.html"><span data-en>Why US & Canada</span><span data-tr>Neden ABD & Kanada</span></a></li>
                <li><a href="${base}partners.html"><span data-en>Partners</span><span data-tr>İş Ortakları</span></a></li>
                <li><a href="${base}insights.html"><span data-en>Insights</span><span data-tr>İçgörüler</span></a></li>
                <li><a href="${base}contact.html"><span data-en>Contact</span><span data-tr>İletişim</span></a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h5><span data-en>Connect</span><span data-tr>Bağlantı</span></h5>
              <ul>
                <li><a href="mailto:info@crosslaneglobal.com">info@crosslaneglobal.com</a></li>
                <li style="margin-top:12px;font-size:12px;color:var(--text-muted);line-height:1.5">Tysons Corner, Virginia<br>Washington D.C. Metro Area</li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© 2026 Crosslane Global. <span data-en>All rights reserved.</span><span data-tr>Tüm hakları saklıdır.</span></span>
            <span><span data-en>In partnership with</span><span data-tr>İş ortağı:</span> <a href="https://oncu.co.uk" target="_blank" style="color:var(--green-partner)">Oncu Global</a></span>
          </div>
        </div>
      </footer>`;
  }

  function setLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    document.querySelectorAll('[data-set-lang]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-set-lang') === lang);
    });
    try { localStorage.setItem('cg-lang', lang); } catch (e) {}
  }

  function init() {
    // Inject nav
    const navMount = document.getElementById('nav-mount');
    if (navMount) navMount.innerHTML = buildNav();
    // Inject footer
    const footerMount = document.getElementById('footer-mount');
    if (footerMount) footerMount.innerHTML = buildFooter();

    // Wire language toggle
    document.querySelectorAll('[data-set-lang]').forEach(b => {
      b.addEventListener('click', () => setLang(b.getAttribute('data-set-lang')));
    });
    // Restore saved language
    let saved = 'en';
    try { saved = localStorage.getItem('cg-lang') || 'en'; } catch (e) {}
    setLang(saved);

    // Solid nav on scroll (only on dark-hero pages)
    const nav = document.getElementById('mainNav');
    const hasDarkHero = document.querySelector('.hero, .subhero');
    if (nav && hasDarkHero) {
      const onScroll = () => {
        if (window.scrollY > 60) nav.classList.add('solid');
        else nav.classList.remove('solid');
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    } else if (nav) {
      // Pages without dark hero: always solid
      nav.classList.add('solid');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
