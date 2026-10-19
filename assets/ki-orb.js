/* ki-orb.js — grosser Thinking Orb (Punktkugel) als Canvas für den KI-Header.
   Bewegungslogik nach github.com/yogesharc/thinking-orbs (MIT © Yogesh), für grosse Flächen neu gezeichnet.
   Zeichnet in der CSS-Farbe (color) des Hosts. Varianten (data-kiorb="…"):
   cursor — Kugel neigt sich zum Cursor, zwei Funken wandern, Lichthof unter dem Cursor
   cycle  — wechselt alle ~5 s die Art: Denkt nach · Sucht · Arbeitet · Verdichtet (Klick/Tipp = nächste)
   lens   — Cursor ist eine Lupe über den Punkten, Klick/Tipp schickt eine Welle; ohne Cursor sucht sie selbst */
(function () {
  const TAU = Math.PI * 2, GOLD = Math.PI * (3 - Math.sqrt(5));
  const ease = (x) => (1 - Math.cos(Math.PI * x)) / 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const bump = (ang, w) => (ang < w ? (1 - (ang / w) ** 2) ** 2 : 0);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STATES = [['reasoning', 'Denkt nach'], ['searching', 'Sucht'], ['working', 'Arbeitet'], ['compacting', 'Verdichtet']];
  const AXIS = (() => { const tp = 30 * Math.PI / 180, rl = 10 * Math.PI / 180; return [-Math.sin(rl) * Math.cos(tp), Math.cos(rl) * Math.cos(tp), Math.sin(tp)]; })();

  function sphere(n) {
    return Array.from({ length: n }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * GOLD;
      return [r * Math.cos(th), y, r * Math.sin(th)];
    });
  }
  function neighbours(pts, k) {
    return pts.map((p, i) => {
      const idx = [], d = [];
      for (let j = 0; j < pts.length; j++) {
        if (j === i) continue;
        const e = (p[0] - pts[j][0]) ** 2 + (p[1] - pts[j][1]) ** 2 + (p[2] - pts[j][2]) ** 2;
        let at = idx.length;
        if (at === k) { if (e >= d[k - 1]) continue; at--; }
        while (at > 0 && d[at - 1] > e) { idx[at] = idx[at - 1]; d[at] = d[at - 1]; at--; }
        idx[at] = j; d[at] = e;
      }
      return idx;
    });
  }
  function spot(k) {
    const phi = k * 2.45 + hash(k) * 1.5, th = ((15 + 30 * hash(k + 0.5)) * Math.PI) / 180;
    return [Math.sin(th) * Math.cos(phi), Math.sin(th) * Math.sin(phi), Math.cos(th)];
  }
  function lensAt(t) {
    const k = Math.floor(t / 1800), u = t / 1800 - k, e = u < 0.4 ? ease(u / 0.4) : 1;
    const a = spot(k), b = spot(k + 1), v = a.map((x, j) => x + (b[j] - x) * e), n = Math.hypot(...v);
    return v.map((x) => x / n);
  }
  const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

  function mount(host) {
    const variant = host.dataset.kiorb || 'cursor';
    const small = matchMedia('(max-width: 760px)').matches;
    const pts = sphere(small ? 560 : 900);
    const near = neighbours(pts, 10);
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const size = () => {
      const b = host.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
      W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    };
    size(); new ResizeObserver(size).observe(host);

    let label = null;
    if (variant === 'cycle') {
      label = document.createElement('div'); label.className = 'kiorb-label mono';
      host.appendChild(label);
    }

    // Zeiger
    const ptr = { x: 0, y: 0, in: false, at: -1e9 };
    let ripple = null, manual = 0, tNow = 0;
    const loc = (e) => { const b = host.getBoundingClientRect(); ptr.x = e.clientX - b.left; ptr.y = e.clientY - b.top; ptr.in = true; ptr.at = tNow; };
    host.addEventListener('pointermove', loc);
    host.addEventListener('pointerleave', () => { ptr.in = false; });
    host.addEventListener('pointerenter', (e) => {
      if (variant === 'cycle' && e.pointerType === 'mouse') { manual++; cycleStart = tNow; }
    });
    host.addEventListener('pointerdown', (e) => {
      loc(e);
      if (variant === 'cycle') { manual++; cycleStart = tNow; }
      if (variant === 'lens') ripple = { t0: tNow, p: lens.slice() };
    });

    const toFace = (R, cx, cy) => {
      let lx = (ptr.x - cx) / R, ly = -(ptr.y - cy) / R; const m = Math.hypot(lx, ly);
      if (m > 0.92) { lx *= 0.92 / m; ly *= 0.92 / m; }
      return [lx, ly, Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly))];
    };

    const tilt = { yaw: 0, pitch: 0 };
    let lens = [0, 0, 1], cycleStart = 0;
    const walks = [[], []]; let hops = 0;

    function draw(t) {
      tNow = t;
      const w = W, h = H; if (!w || !h) return;
      const ink = getComputedStyle(host).color;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = ink;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4, rs = Math.max(1, R * (small ? 0.014 : 0.0115));
      const active = ptr.in && t - ptr.at < 2500;

      // Ausrichtung
      let yaw = (t / 9000) * TAU, pitch = (20 * Math.PI) / 180;
      if (variant === 'cursor') {
        const ty = active ? clamp((ptr.x - cx) / (w / 2), -1, 1) * 0.9 : 0.25 * Math.sin(t / 2600);
        const tp = active ? -clamp((ptr.y - cy) / (h / 2), -1, 1) * 0.6 : 0.12 * Math.cos(t / 3100);
        tilt.yaw += (ty - tilt.yaw) * 0.06; tilt.pitch += (tp - tilt.pitch) * 0.06;
        yaw += tilt.yaw; pitch += tilt.pitch;
      }
      const sy = Math.sin(yaw), cyw = Math.cos(yaw), st = Math.sin(pitch), ct = Math.cos(pitch);
      const facing = (k) => pts[k][1] * st + (-pts[k][0] * sy + pts[k][2] * cyw) * ct;

      // Zyklus: Zustand + Ein-/Ausblenden
      let state = 'reasoning', K = 1;
      if (variant === 'cycle') {
        const DUR = 5200, FADE = 700, e = REDUCED ? 0 : Math.max(0, t - cycleStart);
        const i = (Math.floor(e / DUR) + manual) % STATES.length, u = e % DUR;
        state = STATES[i][0];
        K = ease(clamp(u / FADE, 0, 1)) * (1 - ease(clamp((u - (DUR - FADE)) / FADE, 0, 1)));
        const txt = String(i + 1).padStart(2, '0') + ' / 04 · ' + STATES[i][1];
        if (label.textContent !== txt) label.textContent = txt;
      }
      const reasoning = variant === 'cursor' || state === 'reasoning';

      // Funken-Spaziergang
      const lit = new Map();
      if (reasoning) {
        const nw = variant === 'cursor' ? 2 : 1, s = t / 200, n = Math.floor(s), f = s - n;
        for (let wI = 0; wI < nw; wI++) if (!walks[wI].length) {
          const best = [...pts.keys()].reduce((b, k) => (facing(k) + (wI ? -0.8 * pts[k][0] : 0) > facing(b) + (wI ? -0.8 * pts[b][0] : 0) ? k : b), 0);
          walks[wI].push(best);
        }
        hops = Math.max(hops, n - 16);
        for (; hops < n; hops++) for (let wI = 0; wI < nw; wI++) {
          const wk = walks[wI], recent = wk.slice(-8), from = wk[wk.length - 1], other = nw > 1 ? walks[1 - wI].at(-1) : undefined;
          let best = -1, sc = -Infinity;
          near[from].forEach((k, j) => {
            const ap = other === undefined ? 0 : 1.2 * Math.min(Math.hypot(pts[k][0] - pts[other][0], pts[k][1] - pts[other][1], pts[k][2] - pts[other][2]), 0.8);
            const v = facing(k) + 0.35 * hash(hops * 31 + j + wI * 977) + ap;
            if (!recent.includes(k) && v > sc) { sc = v; best = k; }
          });
          wk.push(best < 0 ? near[from][0] : best); if (wk.length > 16) wk.shift();
        }
        for (let wI = 0; wI < nw; wI++) {
          const wk = walks[wI];
          for (let j = 5; j >= 0; j--) {
            const k = wk[wk.length - 1 - j]; if (k === undefined) continue;
            const v = j === 0 ? ease(Math.min(1, f * 2)) : 1 - (j - 1 + f) / 6;
            lit.set(k, Math.max(lit.get(k) || 0, v));
          }
        }
      }

      // Lupe
      let L = null, LW = 0.6;
      if (variant === 'lens') {
        const target = active ? toFace(R, cx, cy) : lensAt(t);
        lens = norm(lens.map((x, j) => x + (target[j] - x) * (active ? 0.18 : 0.08)));
        L = lens; LW = 0.55;
      } else if (state === 'searching') L = lensAt(t);
      const halo = variant === 'cursor' && active ? toFace(R, cx, cy) : null;

      // Verdichten
      let sweep = null;
      if (state === 'compacting' && variant === 'cycle') {
        const u = (t % 2800) / 2800, s = (u - 0.7) / 0.3;
        const rel = s < 0.45 ? 1 - 1.25 * ease(s / 0.45) : s < 0.7 ? -0.25 * (1 - (s - 0.45) / 0.25) ** 2 : 0;
        sweep = { at: -1.15 + 2.3 * Math.min(1, u / 0.7), hold: u < 0.7 ? 1 : rel };
      }
      const rip = ripple && t - ripple.t0 < 700 ? ripple : null;

      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i];
        const z1 = -x * sy + z * cyw;
        let vx = x * cyw + z * sy, vy = y * ct - z1 * st; const vz = y * st + z1 * ct;
        const d = (vz + 1) / 2;
        let r = (0.5 + 1.4 * d) * rs, a = Math.max(0, (d - 0.3) / 0.7);
        if (reasoning) {
          a *= 1 - 0.5 * K;
          const sp = (lit.get(i) || 0) * K;
          if (sp) { r *= 1 + 0.9 * sp; a += (1 - a) * sp; }
        }
        if (L) {
          const k = variant === 'lens' ? 1 : K;
          const ang = Math.acos(clamp(vx * L[0] + vy * L[1] + vz * L[2], -1, 1)), g = bump(ang, LW) * k;
          a *= 1 - 0.55 * k * (1 - g / (k || 1));
          if (g) {
            vx *= 1 + 0.12 * g; vy *= 1 + 0.12 * g;
            vx += (vx - L[0]) * 0.35 * g; vy += (vy - L[1]) * 0.35 * g;
            r *= 1 + 1.1 * g; a += (1 - a) * g;
          }
        }
        if (halo) {
          const g = bump(Math.acos(clamp(vx * halo[0] + vy * halo[1] + vz * halo[2], -1, 1)), 0.5);
          if (g) { r *= 1 + 0.45 * g; a += (1 - a) * g * 0.8; }
        }
        if (state === 'working' && variant === 'cycle') {
          const u = t % 1700, at = 1.3 - 2.6 * ease(Math.min(1, u / 1200));
          const q = vx * AXIS[0] + vy * AXIS[1] + vz * AXIS[2];
          const g = (u < 1200 ? Math.exp(-(((q - at) / 0.2) ** 2)) : 0) * K;
          r *= 1 + 0.7 * g; a += (1 - a) * g;
          const wv = Math.min(1, Math.max(0, (q - at) / 0.2)) * (u < 1200 ? 1 : 1 - Math.min(1, 1.6 * ((u - 1200) / 800))) * K;
          vx *= 1 - 0.08 * wv; vy *= 1 - 0.08 * wv; r *= 1 - 0.15 * wv;
        }
        if (sweep) {
          const wv = Math.min(1, Math.max(0, (sweep.at - vx) / 0.2)) * sweep.hold * K;
          vx *= 1 - 0.3 * wv; vy *= 1 - 0.3 * wv; r *= 1 - 0.45 * wv;
        }
        if (rip) {
          const s = t - rip.t0, run = s / 700, ak = Math.acos(clamp(vx * rip.p[0] + vy * rip.p[1] + vz * rip.p[2], -1, 1));
          const press = s < 60 ? s / 60 : Math.max(0, 1 - (s - 60) / 240) ** 2, pw = press * bump(ak, 0.5);
          const ring = Math.exp(-(((ak - (0.15 + 1.3 * (1 - (1 - run) ** 2))) / 0.18) ** 2)) * (1 - run) ** 2;
          vx *= 1 - 0.14 * pw; vy *= 1 - 0.14 * pw; r *= (1 - 0.35 * pw) * (1 + 0.8 * ring); a += (1 - a) * ring;
        }
        if (a < 0.01) continue;
        ctx.globalAlpha = Math.min(1, a);
        ctx.beginPath(); ctx.arc(cx + vx * R, cy - vy * R, Math.max(0.5, r), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const t0 = performance.now();
    let visible = true;
    new IntersectionObserver((es) => (visible = es[es.length - 1].isIntersecting)).observe(host);
    if (REDUCED) { draw(1500); new ResizeObserver(() => draw(1500)).observe(host); return; }
    const loop = (now) => { if (visible) draw(Math.max(0, now - t0)); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // Pfeil-Orb («Browser / Computer Use · Arrow»): ein Mauspfeil aus Punkten, der sanft in Richtung
  // data-aim (Grad, 0 = rechts, -90 = unten) gleitet, klickt und zurückfedert. Für CTAs.
  const ARROW = [[0, 0], [0, 16], [4, 12], [7, 18], [9, 17], [6, 11], [11, 11]].map(([x, y]) => [(x / 18) * 1.05, (y / 18) * 1.05]);
  function inside(poly, x, y) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  function mountArrow(host) {
    const pts = sphere(4200);
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const size = () => { const b = host.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); };
    size(); new ResizeObserver(size).observe(host);
    const aim = ((parseFloat(host.dataset.aim) || -45) * Math.PI) / 180;
    const dir = [Math.cos(aim), Math.sin(aim)];
    // Der klassische Pfeil zeigt von seiner Mitte aus nach ~113° (oben links); so weit drehen, bis er auf aim zeigt.
    const phi = aim - (113 * Math.PI) / 180, cp = Math.cos(-phi), sp = Math.sin(-phi);
    const trigger = host.closest('.bigcta') || host;
    let hot = 0, hotT = 0;
    trigger.addEventListener('pointerenter', () => (hotT = 1));
    trigger.addEventListener('pointerleave', () => (hotT = 0));
    const PER = 2600;
    function draw(t) {
      if (!W || !H) return;
      hot += (hotT - hot) * 0.08;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = getComputedStyle(host).color;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46, rs = Math.max(0.55, R * 0.0072);
      const u = (t % PER) / PER;
      const e = u < 0.35 ? ease(u / 0.35) : u < 0.55 ? 1 : u < 0.9 ? 1 - ease((u - 0.55) / 0.35) : 0;
      const s = (u - 0.35) * PER, press = s < 0 ? 0 : s < 60 ? s / 60 : Math.max(0, 1 - (s - 60) / 240) ** 2;
      const reach = 0.1 + 0.08 * hot;
      const tip = [dir[0] * (0.42 + reach * e), dir[1] * (0.42 + reach * e)];
      const k = 1 - 0.14 * press, run = s < 0 ? 1 : Math.min(1, s / 700);
      const yaw = (t / 14000) * TAU, pitch = (20 * Math.PI) / 180;
      const sy = Math.sin(yaw), cyw = Math.cos(yaw), st = Math.sin(pitch), ct = Math.cos(pitch);
      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i];
        const z1 = -x * sy + z * cyw, vx = x * cyw + z * sy, vy = y * ct - z1 * st, vz = y * st + z1 * ct;
        const d = (vz + 1) / 2;
        let r = (0.5 + 1.4 * d) * rs, a = Math.max(0, (d - 0.3) / 0.7) * 0.22;
        const front = clamp((d - 0.5) / 0.2, 0, 1);
        const ux = (vx - tip[0]) / k, uy = (vy - tip[1]) / k;
        const px = ux * cp - uy * sp, py = ux * sp + uy * cp;
        if (front && inside(ARROW, px, -py)) { r *= 1.3; a += (1 - a) * front; }
        if (run < 1) {
          const dist = Math.hypot(vx - tip[0], vy - tip[1]);
          const ring = Math.exp(-(((dist - (0.05 + 0.45 * (1 - (1 - run) ** 2))) / 0.08) ** 2)) * (1 - run) ** 2 * front;
          if (ring) { r *= 1 + 0.6 * ring; a += (1 - a) * ring * 0.8; }
        }
        if (a < 0.01) continue;
        ctx.globalAlpha = Math.min(1, a);
        ctx.beginPath(); ctx.arc(cx + vx * R, cy - vy * R, Math.max(0.5, r), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    let visible = true;
    new IntersectionObserver((es) => (visible = es[es.length - 1].isIntersecting)).observe(host);
    if (REDUCED) { draw(PER * 0.45); new ResizeObserver(() => draw(PER * 0.45)).observe(host); return; }
    const t0 = performance.now();
    const loop = (now) => { if (visible) draw(Math.max(0, now - t0)); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ── Zyklus-Orb: wechselt alle ~5 s die Art (Hover/Klick = nächste) ──────────────────────────
  const CYCLE = [
    ['compacting', 'Verdichtet'],
    ['compacting-squeeze', 'Presst'],
    ['using-type', 'Schreibt'],
    ['background-spiral', 'Arbeitet im Hintergrund'],
    ['working', 'Arbeitet'],
  ];
  const TWIST = 1.4;
  const TEXT = ['xxxx xxx xx', 'xxxxx xx xxxx', 'xxx xxxxx'];
  const CELL = 0.09, LEAD = 0.3, TOP = 0.33, LEFT = -0.5;
  const KEYS = (() => {
    let at = 0;
    return TEXT.flatMap((line, row) => [...line].map((ch, col) => {
      const key = { row, col, at };
      at += ch === ' ' ? 200 : col === line.length - 1 ? 350 : 70 + 60 * hash(row * 31 + col);
      return key;
    }));
  })();
  const KEY_OF = TEXT.map((_, row) => KEYS.flatMap((k, i) => (k.row === row ? [i] : [])));
  const TYPED = KEYS[KEYS.length - 1].at, PARAGRAPH = TYPED + 1300;
  function typeAt(t) {
    const c = t % PARAGRAPH; let n = 0;
    while (n < KEYS.length && KEYS[n].at <= c) n++;
    const since = n ? c - KEYS[n - 1].at : Infinity;
    const next = KEYS[n] || { row: TEXT.length - 1, col: TEXT[TEXT.length - 1].length };
    const blink = since < 300 ? 1 : +(Math.floor(c / 450) % 2 === 0);
    return { n, since, blink, caret: [LEFT + next.col * CELL, TOP - next.row * LEAD], fade: c < TYPED + 900 ? 1 : Math.max(0, 1 - (c - TYPED - 900) / 300) };
  }
  function arms(count) {
    const at = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    const g = Math.sqrt((4 * Math.PI) / count), n = 8, along = 0.6 * g;
    return Array.from({ length: n }, (_, m) => {
      const room = m ? m & -m : n;
      const lim = Math.min((85 * Math.PI) / 180, Math.acos(Math.min(1, (g * n) / (TAU * room))));
      const out = [];
      for (let lat = -lim + ((m * 0.618) % 1) * along; lat <= lim; lat += along / Math.sqrt(1 + Math.cos(lat) ** 2)) out.push(at(lat, (m / n) * TAU - lat));
      return out;
    }).flat();
  }
  function mountCycle(host) {
    const small = matchMedia('(max-width: 760px)').matches;
    const N = small ? 1100 : 1700;
    const SPH = sphere(N), SPI = arms(N);
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const size = () => { const b = host.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); };
    size(); new ResizeObserver(size).observe(host);
    const label = document.createElement('div'); label.className = 'kiorb-label mono'; host.appendChild(label);
    let manual = 0, start = 0, tNow = 0;
    const skip = () => { manual++; start = tNow; };
    host.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') skip(); });
    host.addEventListener('pointerdown', skip);
    const DUR = 5200, FADE = 600;

    function draw(t) {
      tNow = t; if (!W || !H) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = getComputedStyle(host).color;
      const e = REDUCED ? 0 : Math.max(0, t - start);
      const idx = (Math.floor(e / DUR) + manual) % CYCLE.length, u = e % DUR, ls = e;
      const state = CYCLE[idx][0];
      const K = ease(clamp(u / FADE, 0, 1)) * (1 - ease(clamp((u - (DUR - FADE)) / FADE, 0, 1)));
      const txt = String(idx + 1).padStart(2, '0') + ' / ' + String(CYCLE.length).padStart(2, '0') + ' · ' + CYCLE[idx][1];
      if (label.textContent !== txt) label.textContent = txt;

      const pts = state === 'background-spiral' ? SPI : SPH;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.4;
      const rs = Math.max(0.6, R * (small ? 0.0125 : 0.0092));
      const period = state === 'working' ? 3000 : state.startsWith('compacting') ? 10000 : 13000;
      const yaw = (t / period) * TAU, pitch = (20 * Math.PI) / 180;
      const st = Math.sin(pitch), ct = Math.cos(pitch);
      const tw = state === 'compacting-squeeze' ? Math.sin((ls / 2600) * TAU) * K : 0;
      let sweep = null;
      if (state === 'compacting') {
        const uu = (ls % 2800) / 2800, s = (uu - 0.7) / 0.3;
        const rel = s < 0.45 ? 1 - 1.25 * ease(s / 0.45) : s < 0.7 ? -0.25 * (1 - (s - 0.45) / 0.25) ** 2 : 0;
        sweep = { at: -1.15 + 2.3 * Math.min(1, uu / 0.7), hold: (uu < 0.7 ? 1 : rel) * K };
      }
      const type = state === 'using-type' ? typeAt(ls) : null;
      const fadeAll = 0.35 + 0.65 * K;

      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i];
        const turn = yaw + TWIST * tw * y, ly = Math.sin(turn), lc = Math.cos(turn);
        const z1 = -x * ly + z * lc;
        let vx = x * lc + z * ly, vy = y * ct - z1 * st; const vz = y * st + z1 * ct;
        const d = (vz + 1) / 2;
        let r = (0.5 + 1.4 * d) * rs, a = Math.max(0, (d - 0.3) / 0.7);
        if (sweep) {
          const w = Math.min(1, Math.max(0, (sweep.at - vx) / 0.2)) * sweep.hold;
          vx *= 1 - 0.3 * w; vy *= 1 - 0.3 * w; r *= 1 - 0.45 * w;
        }
        if (state === 'working') {
          const uu = ls % 1700, at = 1.3 - 2.6 * ease(Math.min(1, uu / 1200));
          const q = vx * AXIS[0] + vy * AXIS[1] + vz * AXIS[2];
          const g = (uu < 1200 ? Math.exp(-(((q - at) / 0.2) ** 2)) : 0) * K;
          r *= 1 + 0.6 * g; a += (1 - a) * g;
          const w = Math.min(1, Math.max(0, (q - at) / 0.2)) * (uu < 1200 ? 1 : 1 - Math.min(1, 1.6 * ((uu - 1200) / 800))) * K;
          vx *= 1 - 0.08 * w; vy *= 1 - 0.08 * w; r *= 1 - 0.15 * w;
        }
        if (type) {
          a *= 1 - 0.75 * K;
          const row = Math.round((TOP - vy) / LEAD), col = Math.floor((vx - LEFT) / CELL), key = KEY_OF[row] && KEY_OF[row][col];
          let g = 0;
          if (key !== undefined && key < type.n && TEXT[row][col] === 'x' && Math.abs(TOP - row * LEAD - vy) < 0.085)
            g = 0.75 + (key === type.n - 1 ? 0.25 * Math.exp(-type.since / 120) : 0);
          const [kx, ky] = type.caret;
          if (Math.abs(vy - ky) < 0.1) g = Math.max(g, type.blink * Math.exp(-(((vx - kx) / 0.04) ** 2)));
          a += (1 - a) * g * type.fade * K * clamp((d - 0.5) / 0.2, 0, 1);
        }
        a *= fadeAll;
        if (a < 0.01) continue;
        ctx.globalAlpha = Math.min(1, a);
        ctx.beginPath(); ctx.arc(cx + vx * R, cy - vy * R, Math.max(0.5, r), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    let visible = true;
    new IntersectionObserver((es) => (visible = es[es.length - 1].isIntersecting)).observe(host);
    if (REDUCED) { draw(1500); new ResizeObserver(() => draw(1500)).observe(host); return; }
    const t0 = performance.now();
    const loop = (now) => { if (visible) draw(Math.max(0, now - t0)); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  const boot = () => document.querySelectorAll('[data-kiorb]').forEach((h) => (h.dataset.kiorb === 'arrow' ? mountArrow(h) : h.dataset.kiorb === 'cycle' ? mountCycle(h) : mount(h)));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
