/* Shared site behaviors: mobile nav, scroll reveal, hero variant switching, year. */
(function () {
  function ready(fn) { document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn(); }

  ready(function () {
    // Mobile nav
    const nav = document.querySelector('.nav');
    const burger = document.querySelector('.nav-burger');
    if (burger && nav) burger.addEventListener('click', () => nav.classList.toggle('open'));
    document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => nav && nav.classList.remove('open')));

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
