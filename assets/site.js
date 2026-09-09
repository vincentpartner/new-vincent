/* Shared site behaviors: mobile nav, scroll reveal, hero variant switching, year. */
(function () {
  function ready(fn) { document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn(); }

  ready(function () {
    // Soft page exit: fade body out (120 ms) before following an internal link; restore on bfcache return.
    if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      document.addEventListener('click', function (e) {
        const a = e.target.closest('a[href]');
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (a.target && a.target !== '_self') return;
        if (a.hasAttribute('download') || /^(mailto|tel|javascript):/.test(a.getAttribute('href'))) return;
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && url.hash) return;
        e.preventDefault();
        document.documentElement.setAttribute('data-leaving', '');
        setTimeout(() => { location.href = url.href; }, 120);
      });
      window.addEventListener('pageshow', () => document.documentElement.removeAttribute('data-leaving'));
    }

    // Mobile nav
    const nav = document.querySelector('.nav');
    const burger = document.querySelector('.nav-burger');
    const links = document.querySelector('.nav-links');
    if (links && !links.id) links.id = 'site-nav-links';
    const syncBurger = () => { if (!burger) return; const o = nav.classList.contains('open'); burger.setAttribute('aria-expanded', o ? 'true' : 'false'); burger.setAttribute('aria-label', o ? 'Menü schliessen' : 'Menü öffnen'); };
    if (burger && nav) {
      burger.setAttribute('aria-controls', 'site-nav-links');
      burger.addEventListener('click', () => { if (matchMedia('(max-width: 760px)').matches) return; nav.classList.toggle('open'); syncBurger(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); syncBurger(); burger.focus(); } });
      syncBurger();
    }
    document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => { if (nav) { nav.classList.remove('open'); syncBurger(); } }));

    // Mobile Kachelmenü (≤760px, CSS in mobile.css): öffnet über den Header-Burger unter der fixierten Navigation.
    if (nav && burger && !document.querySelector('.mmenu')) {
      const navLinks = Array.from(document.querySelectorAll('.nav-links > a, .nav-links .nav-drop-menu a'));
      const page = location.pathname.split('/').pop() || 'index.html';
      const full = { 'About': 'About', 'Work': 'Referenzen', 'Web': 'Webdesign', 'Shops': 'Onlineshops', 'Marketing': 'Marketing', 'SEO / GEO': 'SEO / GEO', 'KI': 'KI & Automation' };
      const tiles = navLinks.map((a, i) => {
        const href = a.getAttribute('href'); const t = a.textContent.trim();
        return '<a href="' + href + '"' + (href === page ? ' class="active"' : '') + '><span class="n">0' + (i + 1) + '</span>' + (full[t] || t) + '</a>';
      }).join('');
      const menu = document.createElement('div'); menu.className = 'mmenu'; menu.id = 'mobile-menu'; menu.setAttribute('aria-hidden', 'true');
      menu.innerHTML = '<nav class="mm-grid" aria-label="Mobile Navigation">' + tiles +
        '<a href="Kontakt.html" class="cta' + (page === 'Kontakt.html' ? ' active' : '') + '"><span class="n"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span>Termin buchen</a>' +
        '<a href="tel:+41445346560" class="cta"><span class="n"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg></span>Anrufen</a></nav>' +
        '<div class="mm-foot"><a href="mailto:info@vincent-partner.ch">info@vincent-partner.ch</a><a href="Impressum.html">Impressum</a></div>';
      nav.appendChild(menu);
      const isPhone = () => matchMedia('(max-width: 760px)').matches;
      const setOpen = (o) => { menu.classList.toggle('open', o); menu.setAttribute('aria-hidden', o ? 'false' : 'true'); document.body.classList.toggle('mmenu-open', o); };
      // Auf Smartphones steuert der Burger das Kachelmenü, auf Tablets die klassische Liste (.nav.open)
      burger.addEventListener('click', () => { if (isPhone()) { nav.classList.remove('open'); setOpen(!menu.classList.contains('open')); burger.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false'); } else setOpen(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) { setOpen(false); burger.setAttribute('aria-expanded', 'false'); burger.focus(); } });
      menu.addEventListener('click', e => { if (e.target.closest('a')) { setOpen(false); burger.setAttribute('aria-expanded', 'false'); } });
      matchMedia('(max-width: 760px)').addEventListener('change', () => { setOpen(false); nav.classList.remove('open'); syncBurger(); });
    }

    // Scroll reveal
    const reveals = Array.from(document.querySelectorAll('.reveal'));
    function reveal(n) { n.classList.add('in'); }
    window.__revealAll = () => reveals.forEach(reveal);

    if (!('IntersectionObserver' in window)) {
      reveals.forEach(reveal);
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach((n, i) => {
        n.style.transitionDelay = (Math.min(i % 4, 3) * 70) + 'ms';
        // anything already in view on load reveals immediately (no waiting)
        const r = n.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.95 && r.bottom > 0) reveal(n);
        else io.observe(n);
      });
      // safety net: never leave content hidden if observer never fires
      setTimeout(() => reveals.forEach(reveal), 2600);
    }

    // Hero variant switching (driven by Tweaks: data-hero on <html>)
    function applyHero() {
      const mode = document.documentElement.getAttribute('data-hero') || 'Buchstaben';
      document.querySelectorAll('[data-hero-letters]').forEach(n => n.style.display = (mode === 'Buchstaben') ? '' : 'none');
      document.querySelectorAll('[data-hero-static]').forEach(n => n.style.display = (mode === 'Statisch') ? '' : 'none');
    }
    applyHero();
    document.addEventListener('tweaks:apply', applyHero);

    // Footer year
    document.querySelectorAll('[data-year]').forEach(n => n.textContent = new Date().getFullYear());
  });
})();
