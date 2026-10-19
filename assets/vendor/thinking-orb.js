/* Thinking Orbs — Zustand «reasoning» (ein Funke wandert über die Kugel).
   Reduzierte Plain-JS-Portierung von github.com/yogesharc/thinking-orbs
   (apps/web/registry/orb/orb-core.ts), MIT-Lizenz © Yogesh. Lokal ausgeliefert.
   Verwendung: mountOrb(svgElement, { size: 20, label: "…" }) — zeichnet in currentColor. */
(function () {
  const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const ease = (x) => (1 - Math.cos(Math.PI * x)) / 2;
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const nearest = (pts, i, k) => {
    const idx = [], d = [], p = pts[i];
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const e = dist2(p, pts[j]); let at = idx.length;
      if (at === k) { if (e >= d[k - 1]) continue; at--; }
      while (at > 0 && d[at - 1] > e) { idx[at] = idx[at - 1]; d[at] = d[at - 1]; at--; }
      idx[at] = j; d[at] = e;
    }
    return idx;
  };
  const PERIOD = 6500, HOP = 220, TAIL = 5, REACH = 24, WALK = 16;
  const clocks = new Map();
  function tick(look, now, speed) {
    let c = clocks.get(look);
    if (!c) clocks.set(look, (c = { t: 0, last: now }));
    if (now > c.last) { c.t += Math.min(now - c.last, 100) * speed; c.last = now; }
    return c.t;
  }
  function mountOrb(svg, opt) {
    const o = opt || {}, size = o.size || 20, speed = o.speed || 1, tilt = o.tilt == null ? 20 : o.tilt, dotSize = o.dotSize || 1;
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size); svg.setAttribute('fill', 'currentColor');
    if (o.label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', o.label); } else svg.setAttribute('aria-hidden', 'true');
    const dens = 4, count = Math.max(8, Math.round(size * dens * (o.density || 1)));
    const c = size / 2, R = c * 0.8, rs = (size / 64) ** 0.6 * (0.72 * Math.sqrt(4 / dens)) * dotSize;
    const pts = Array.from({ length: count }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / count, r = Math.sqrt(1 - y * y), th = i * GOLDEN;
      return [r * Math.cos(th), y, r * Math.sin(th)];
    });
    const els = pts.map(() => svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle')));
    const hidden = new Uint8Array(pts.length);
    const near = pts.map((_, i) => nearest(pts, i, REACH));
    const walk = []; let hops = 0;
    const draw = (t) => {
      const yaw = (t / PERIOD) * TAU, pitch = (tilt * Math.PI) / 180;
      const sy = Math.sin(yaw), cy = Math.cos(yaw), st = Math.sin(pitch), ct = Math.cos(pitch);
      const facing = (k) => pts[k][1] * st + (-pts[k][0] * sy + pts[k][2] * cy) * ct;
      const s = t / HOP, n = Math.floor(s), f = s - n;
      if (!walk.length) walk.push([...pts.keys()].reduce((b, k) => (facing(k) > facing(b) ? k : b), 0));
      hops = Math.max(hops, n - WALK);
      for (; hops < n; hops++) {
        const recent = walk.slice(-8), from = walk[walk.length - 1];
        let best = -1, score = -Infinity;
        near[from].forEach((k, j) => {
          const sc = facing(k) + 0.35 * hash(hops * 31 + j);
          if (!recent.includes(k) && sc > score) { score = sc; best = k; }
        });
        walk.push(best < 0 ? near[from][0] : best);
        if (walk.length > WALK) walk.shift();
      }
      const lit = new Map();
      for (let j = TAIL - 1; j >= 0; j--) {
        const k = walk[walk.length - 1 - j];
        if (k !== undefined) lit.set(k, Math.max(lit.get(k) || 0, j === 0 ? ease(Math.min(1, f * 2)) : 1 - (j - 1 + f) / TAIL));
      }
      pts.forEach(([x, y, z], i) => {
        const z1 = -x * sy + z * cy, vx = x * cy + z * sy, vy = y * ct - z1 * st, vz = y * st + z1 * ct;
        const d = (vz + 1) / 2;
        let r = (0.5 + 1.4 * d) * rs, a = Math.max(0, (d - 0.3) / 0.7) * 0.5;
        const spark = lit.get(i) || 0;
        if (spark) { r *= 1 + 0.8 * spark; a += (1 - a) * spark; }
        const el = els[i], op = a.toFixed(2);
        if (op === '0.00' && hidden[i]) return;
        hidden[i] = +(op === '0.00');
        el.setAttribute('cx', (c + vx * R).toFixed(2)); el.setAttribute('cy', (c - vy * R).toFixed(2));
        el.setAttribute('r', Math.max(0.45, r).toFixed(2)); el.setAttribute('fill-opacity', op);
      });
    };
    const look = 'reasoning@' + speed;
    draw(tick(look, performance.now(), speed));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = false, raf = 0, dead = false;
    const io = new IntersectionObserver((es) => (visible = es[es.length - 1].isIntersecting));
    io.observe(svg);
    function frame(now) { if (visible) draw(tick(look, now, speed)); raf = requestAnimationFrame(frame); }
    const pause = () => { cancelAnimationFrame(raf); raf = 0; };
    const play = () => { if (!raf && !still && !dead) raf = requestAnimationFrame(frame); };
    play();
    return { pause, play, destroy() { dead = true; pause(); io.disconnect(); svg.replaceChildren(); } };
  }
  window.ThinkingOrb = { mountOrb };
})();
