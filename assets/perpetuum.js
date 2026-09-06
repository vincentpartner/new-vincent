/* perpetuum.js — abstraktes "Perpetuum mobile" als SVG-Animation.
   Partikel kondensieren aus dem Chaos immer wieder in geordnete
   elliptische Bahnen (Orbits) und lösen sich wieder ins Chaos auf.
   Monochrom: nutzt currentColor (= --ink), passt sich Hell/Dunkel an.

   Aktivierung: <div data-perpetuum></div> in einem position:relative-Rahmen.
*/
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 21:9 Bühne
  const VW = 2100, VH = 900;
  const CX = VW / 2, CY = VH / 2;

  // Konzentrische, breite Ellipsen-Bahnen (rx, ry, Partikelzahl, Winkeltempo)
  const RINGS = [
    { rx: 210, ry: 92,  n: 5,  sp:  0.150 },
    { rx: 360, ry: 150, n: 8,  sp: -0.112 },
    { rx: 500, ry: 208, n: 11, sp:  0.086 },
    { rx: 640, ry: 264, n: 14, sp: -0.064 },
    { rx: 780, ry: 322, n: 18, sp:  0.048 },
    { rx: 920, ry: 380, n: 22, sp: -0.036 }
  ];

  function smootherstep(x) {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  function build(host) {
    if (host.__perpetuum) return;
    host.__perpetuum = true;

    if (getComputedStyle(host).position === 'static') host.style.position = 'absolute';
    host.style.inset = host.style.inset || '0';
    host.style.overflow = 'hidden';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;color:inherit;';
    host.appendChild(svg);

    // --- Bahn-Umrisse (Ellipsen), faden mit der Ordnung ein ---
    const ringEls = RINGS.map(R => {
      const e = document.createElementNS(NS, 'ellipse');
      e.setAttribute('cx', CX); e.setAttribute('cy', CY);
      e.setAttribute('rx', R.rx); e.setAttribute('ry', R.ry);
      e.setAttribute('fill', 'none');
      e.setAttribute('stroke', 'currentColor');
      e.setAttribute('stroke-width', '1.4');
      e.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(e);
      return e;
    });

    // --- Partikel ---
    const parts = [];
    RINGS.forEach((R, ri) => {
      for (let i = 0; i < R.n; i++) {
        const baseAng = (i / R.n) * Math.PI * 2 + Math.random() * 0.25;
        const c = document.createElementNS(NS, 'circle');
        const rad = 4.2 + Math.random() * 2.6;
        c.setAttribute('r', rad.toFixed(2));
        c.setAttribute('fill', 'currentColor');
        svg.appendChild(c);
        parts.push({
          el: c, ring: R, ri, baseAng,
          // Chaos-Heimat: zufällig über die ganze Bühne verteilt
          hx: 140 + Math.random() * (VW - 280),
          hy: 90 + Math.random() * (VH - 180),
          // langsame, eigenständige Chaos-Drift
          dax: Math.random() * Math.PI * 2, day: Math.random() * Math.PI * 2,
          dsx: 0.25 + Math.random() * 0.5, dsy: 0.25 + Math.random() * 0.5,
          amp: 40 + Math.random() * 70,
          tw: Math.random() * Math.PI * 2  // Twinkle-Offset
        });
      }
    });

    // Verbindungslinien innerhalb jeder Bahn (nur im geordneten Zustand sichtbar)
    const links = [];
    let idx = 0;
    RINGS.forEach((R) => {
      const seg = [];
      for (let i = 0; i < R.n; i++) seg.push(parts[idx + i]);
      for (let i = 0; i < R.n; i++) {
        const a = seg[i], b = seg[(i + 1) % R.n];
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('stroke', 'currentColor');
        ln.setAttribute('stroke-width', '1');
        ln.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.insertBefore(ln, parts[0].el); // unter die Punkte
        links.push({ el: ln, a, b });
      }
      idx += R.n;
    });

    const start = performance.now();
    let paused = false;
    // Hover AKTIVIERT die Ordnung (an/aus) — die Bewegung selbst wird NICHT vom
    // Cursor gesteuert. Organisation passiert gross & zentriert wie zuvor.
    let target = 0, order = 0;
    host.addEventListener('mouseenter', () => { target = 1; });
    host.addEventListener('mouseleave', () => { target = 0; });

    function frame(now) {
      requestAnimationFrame(frame);
      if (paused) return;
      const t = (now - start) / 1000;

      // Ordnung wird vom Hover gesteuert (an/aus); Rotation + Chaos-Drift laufen
      // autonom weiter.
      order += (target - order) * 0.045;
      const ord = smootherstep(order);

      // Bahn-Umrisse
      for (let k = 0; k < ringEls.length; k++) {
        ringEls[k].setAttribute('stroke-opacity', (ord * 0.22).toFixed(3));
      }

      // Partikel positionieren
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i], R = pt.ring;
        // Orbit-Position (rotiert dauerhaft → perpetuum)
        const ang = pt.baseAng + R.sp * t * Math.PI;
        const ox = CX + R.rx * Math.cos(ang);
        const oy = CY + R.ry * Math.sin(ang);
        // Chaos-Position (driftet dauerhaft)
        const chx = pt.hx + Math.cos(pt.dax + t * pt.dsx) * pt.amp;
        const chy = pt.hy + Math.sin(pt.day + t * pt.dsy) * pt.amp;
        const x = chx + (ox - chx) * ord;
        const y = chy + (oy - chy) * ord;
        pt.cx = x; pt.cy = y;
        pt.el.setAttribute('cx', x.toFixed(1));
        pt.el.setAttribute('cy', y.toFixed(1));
        // im Chaos heller flackernd, in Ordnung ruhig & klar
        const twk = 0.55 + 0.45 * Math.sin(pt.tw + t * 1.6);
        const op = (0.32 + 0.30 * twk) * (1 - ord) + 0.95 * ord;
        pt.el.setAttribute('opacity', op.toFixed(3));
      }

      // Verbindungslinien
      const lop = (ord - 0.45) / 0.55; // erst spät einblenden
      const lo = lop > 0 ? lop * 0.16 : 0;
      for (let i = 0; i < links.length; i++) {
        const L = links[i];
        if (lo <= 0.002) { L.el.setAttribute('stroke-opacity', '0'); continue; }
        L.el.setAttribute('x1', L.a.cx.toFixed(1));
        L.el.setAttribute('y1', L.a.cy.toFixed(1));
        L.el.setAttribute('x2', L.b.cx.toFixed(1));
        L.el.setAttribute('y2', L.b.cy.toFixed(1));
        L.el.setAttribute('stroke-opacity', lo.toFixed(3));
      }
    }

    if (REDUCED) {
      // Statischer geordneter Zustand
      ringEls.forEach(e => e.setAttribute('stroke-opacity', '0.2'));
      parts.forEach(pt => {
        const R = pt.ring;
        const x = CX + R.rx * Math.cos(pt.baseAng);
        const y = CY + R.ry * Math.sin(pt.baseAng);
        pt.cx = x; pt.cy = y;
        pt.el.setAttribute('cx', x.toFixed(1));
        pt.el.setAttribute('cy', y.toFixed(1));
        pt.el.setAttribute('opacity', '0.9');
      });
      links.forEach(L => {
        L.el.setAttribute('x1', L.a.cx); L.el.setAttribute('y1', L.a.cy);
        L.el.setAttribute('x2', L.b.cx); L.el.setAttribute('y2', L.b.cy);
        L.el.setAttribute('stroke-opacity', '0.14');
      });
      return;
    }

    // Pause, wenn außerhalb des Viewports
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        es.forEach(e => { paused = !e.isIntersecting; });
      }, { threshold: 0 }).observe(host);
    }

    requestAnimationFrame(frame);
  }

  function boot() {
    document.querySelectorAll('[data-perpetuum]').forEach(build);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
