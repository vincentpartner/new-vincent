/* cta-perpetuum.js — "Perpetuum mobile" für CTAs.
   Die umherfliegenden Punkte treiben im Chaos; sobald der Cursor über dem
   CTA ist, organisieren sie sich in konzentrische Bahnen UM DEN CURSOR herum
   und kreisen perpetuell. Verlässt der Cursor die Fläche, zerfällt die Ordnung
   wieder ins Chaos. Ellipsenbahnen (wie der Hero), monochrom (currentColor = --ink).

   Aktivierung: <div class="bigcta" data-ctaperp> … </div>
*/
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ellipsen-Bahnen um den Cursor (rx, ry in px, Partikelzahl, Winkeltempo, Farbe)
  const RINGS = [
    { rx: 60,  ry: 26,  n: 4,  sp:  0.85, col: '#ccff00' },
    { rx: 110, ry: 46,  n: 7,  sp: -0.55, col: '#39ff14' },
    { rx: 160, ry: 66,  n: 10, sp:  0.40, col: '#ff2bd6' },
    { rx: 210, ry: 86,  n: 13, sp: -0.30, col: '#ff7a00' },
    { rx: 260, ry: 106, n: 16, sp:  0.22, col: '#2bd2ff' },
    { rx: 310, ry: 126, n: 20, sp: -0.17, col: '#ccff00' }
  ];

  function smootherstep(x) {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  function build(host) {
    if (host.__ctaperp) return;
    host.__ctaperp = true;

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.overflow = 'hidden';
    const content = host.querySelector(':scope > a, :scope > .awrap');
    if (content) { content.style.position = 'relative'; content.style.zIndex = '2'; }

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;color:inherit;z-index:1;pointer-events:none;';
    host.insertBefore(svg, host.firstChild);

    let W = 0, H = 0;
    const TOUCH = matchMedia('(hover: none)').matches;
    let mx = 0, my = 0;

    const ringEls = RINGS.map((R) => {
      const c = document.createElementNS(NS, 'ellipse');
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', 'currentColor');
      c.setAttribute('stroke-width', '1.2');
      c.setAttribute('vector-effect', 'non-scaling-stroke');
      c.setAttribute('stroke-opacity', '0');
      svg.appendChild(c);
      return c;
    });

    const parts = [];
    RINGS.forEach((R, ri) => {
      for (let i = 0; i < R.n; i++) {
        const el = document.createElementNS(NS, 'circle');
        el.setAttribute('r', (3.4 + Math.random() * 2.2).toFixed(2));
        el.setAttribute('fill', 'currentColor');
        svg.appendChild(el);
        parts.push({
          el, ring: R, ri,
          baseAng: (i / R.n) * Math.PI * 2 + Math.random() * 0.3,
          hx: Math.random(), hy: Math.random(),   // Chaos-Heimat (relativ 0..1)
          dax: Math.random() * Math.PI * 2, day: Math.random() * Math.PI * 2,
          dsx: 0.2 + Math.random() * 0.5, dsy: 0.2 + Math.random() * 0.5,
          amp: 26 + Math.random() * 60,
          tw: Math.random() * Math.PI * 2, cx: 0, cy: 0
        });
      }
    });

    // Verbindungslinien je Bahn (nur in geordnetem Zustand sichtbar)
    const links = [];
    let idx = 0;
    RINGS.forEach((R) => {
      const seg = parts.slice(idx, idx + R.n);
      for (let i = 0; i < R.n; i++) {
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('stroke', 'currentColor');
        ln.setAttribute('stroke-width', '1');
        ln.setAttribute('vector-effect', 'non-scaling-stroke');
        ln.setAttribute('stroke-opacity', '0');
        svg.insertBefore(ln, parts[0].el);
        links.push({ el: ln, a: seg[i], b: seg[(i + 1) % R.n] });
      }
      idx += R.n;
    });

    // Bahnen-Skalierung: auf schmalen Flächen (Smartphone) deutlich kleinere Radien
    let S = 1;
    function resize() {
      const r = host.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      S = W <= 760 ? Math.max(0.28, Math.min(0.45, W / 900)) : 1;
      if (TOUCH) { mx = W / 2; my = H / 2; }
    }
    resize();
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });

    // Cursor
    mx = W / 2; my = H / 2;          // Ziel-Zentrum (Cursor)
    let cx = W / 2, cy = H / 2;      // geglättetes Zentrum
    let target = 0;                  // 1 = Cursor drin → Ordnung
    if (TOUCH) { target = 1; }       // ohne Hover: dauerhaft geordnet um die Mitte
    host.addEventListener('mousemove', e => {
      const r = host.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
    });
    host.addEventListener('mouseenter', () => { target = 1; });
    host.addEventListener('mouseleave', () => { if (!TOUCH) target = 0; });

    let order = 0;
    const start = performance.now();
    let paused = false;

    function frame(now) {
      requestAnimationFrame(frame);
      if (paused) return;
      const t = (now - start) / 1000;

      order += (target - order) * 0.06;
      const o = smootherstep(order);
      cx += (mx - cx) * 0.14;
      cy += (my - cy) * 0.14;

      for (let k = 0; k < ringEls.length; k++) {
        const c = ringEls[k];
        c.setAttribute('cx', cx.toFixed(1));
        c.setAttribute('cy', cy.toFixed(1));
        c.setAttribute('rx', (RINGS[k].rx * S).toFixed(1));
        c.setAttribute('ry', (RINGS[k].ry * S).toFixed(1));
        c.setAttribute('stroke-opacity', (o * 0.20).toFixed(3));
      }

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], R = p.ring;
        const ang = p.baseAng + R.sp * t;
        const ox = cx + R.rx * S * Math.cos(ang);
        const oy = cy + R.ry * S * Math.sin(ang);
        const chx = p.hx * W + Math.cos(p.dax + t * p.dsx) * p.amp;
        const chy = p.hy * H + Math.sin(p.day + t * p.dsy) * p.amp;
        const x = chx + (ox - chx) * o;
        const y = chy + (oy - chy) * o;
        p.cx = x; p.cy = y;
        p.el.setAttribute('cx', x.toFixed(1));
        p.el.setAttribute('cy', y.toFixed(1));
        const twk = 0.55 + 0.45 * Math.sin(p.tw + t * 1.5);
        const op = (0.30 + 0.30 * twk) * (1 - o) + 0.95 * o;
        p.el.setAttribute('opacity', op.toFixed(3));
      }

      const lo = o > 0.45 ? (o - 0.45) / 0.55 * 0.15 : 0;
      for (let i = 0; i < links.length; i++) {
        const L = links[i];
        if (lo <= 0.002) { L.el.setAttribute('stroke-opacity', '0'); continue; }
        L.el.setAttribute('x1', L.a.cx.toFixed(1)); L.el.setAttribute('y1', L.a.cy.toFixed(1));
        L.el.setAttribute('x2', L.b.cx.toFixed(1)); L.el.setAttribute('y2', L.b.cy.toFixed(1));
        L.el.setAttribute('stroke-opacity', lo.toFixed(3));
      }
    }

    if (REDUCED) {
      // Statisches Chaos (kein Bewegungsreiz)
      parts.forEach(p => {
        p.el.setAttribute('cx', (p.hx * W).toFixed(1));
        p.el.setAttribute('cy', (p.hy * H).toFixed(1));
        p.el.setAttribute('opacity', '0.4');
      });
      return;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        es.forEach(e => { paused = !e.isIntersecting; });
      }, { threshold: 0 }).observe(host);
    }

    requestAnimationFrame(frame);
  }

  function boot() { document.querySelectorAll('[data-ctaperp]').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
