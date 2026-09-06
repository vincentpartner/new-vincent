/* Interactive fine dot-grid, scoped to a CTA box.
   Usage: add data-ctadots to a position-relative container (e.g. .bigcta).
   The canvas sits behind the CTA content, reacts to the pointer, and lets
   clicks pass through (pointer-events:none). */
(function () {
  function inkColor(el) {
    const v = getComputedStyle(el).getPropertyValue('--ink').trim();
    return v || '#2A2D31';
  }

  function setup(host) {
    if (host.__dotgrid) return;
    host.__dotgrid = true;

    // Ensure the host can position the absolute canvas + keep content on top.
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const content = host.querySelector(':scope > a, :scope > .awrap');
    if (content) { content.style.position = 'relative'; content.style.zIndex = '1'; }

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none';
    host.insertBefore(canvas, host.firstChild);
    const ctx = canvas.getContext('2d');

    // data-ctadots="attract" pulls dots toward the cursor; default repels.
    const attract = (host.getAttribute('data-ctadots') || '').toLowerCase() === 'attract';
    const dir = attract ? 1 : -1;

    const config = {
      dotSpacing: attract ? 30 : 12,
      dotRadius: 0.5,
      mouseRadius: attract ? 230 : 150,
      force: 0.1,
      returnSpeed: attract ? 0.012 : 0.02,
      opacity: 0.9,
      ballR: attract ? 74 : 60,   // radius of the gathering ball (attract mode)
      pull: 0.03   // gentle, slow approach into the ball
    };

    let points = [];
    let mouse = { x: -9999, y: -9999 };
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;

    function build() {
      const r = host.getBoundingClientRect();
      w = Math.round(r.width); h = Math.round(r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = [];
      const offX = (w % config.dotSpacing) / 2;
      const offY = (h % config.dotSpacing) / 2;
      for (let x = offX; x <= w; x += config.dotSpacing) {
        for (let y = offY; y <= h; y += config.dotSpacing) {
          points.push({ x: x, y: y, origX: x, origY: y, sa: Math.random() * Math.PI * 2, sr: Math.random(), ss: 0.5 + Math.random(),
            r: attract ? (1.0 + Math.random() * Math.random() * 3.0) : config.dotRadius,
            fa: Math.random() * Math.PI * 2, fb: Math.random() * Math.PI * 2,
            famp: attract ? (7 + Math.random() * 16) : 0 });
        }
      }
    }

    function frame() {
      requestAnimationFrame(frame);
      if (paused) return;
      const now = performance.now();
      const t = now * 0.00035; // slow clock for the “swimming” motion
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = inkColor(host);
      ctx.globalAlpha = config.opacity;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (attract) {
          if (dist < config.mouseRadius) {
            // Gather into a round ball and drift slowly inside it.
            const ang = p.sa + t * p.ss;                 // slow orbit
            const rad = config.ballR * (0.18 + 0.82 * p.sr);
            const wob = config.ballR * 0.12;
            const tx = mouse.x + Math.cos(ang) * rad + Math.sin(t * 1.7 + p.sa) * wob;
            const ty = mouse.y + Math.sin(ang) * rad + Math.cos(t * 1.3 + p.sa) * wob;
            p.x += (tx - p.x) * config.pull;
            p.y += (ty - p.y) * config.pull;
          } else {
            // freies, kontinuierliches Floaten um die (versetzte) Heimat
            const hx = p.origX + Math.sin(t * 1.5 + p.fa) * p.famp;
            const hy = p.origY + Math.cos(t * 1.25 + p.fb) * p.famp;
            p.x += (hx - p.x) * config.returnSpeed;
            p.y += (hy - p.y) * config.returnSpeed;
          }
        } else {
          if (dist < config.mouseRadius) {
            const angle = Math.atan2(dy, dx);
            const push = (config.mouseRadius - dist) * config.force;
            p.x += Math.cos(angle) * push * dir;
            p.y += Math.sin(angle) * push * dir;
          }
          p.x += (p.origX - p.x) * config.returnSpeed;
          p.y += (p.origY - p.y) * config.returnSpeed;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let paused = false;

    window.addEventListener('mousemove', e => {
      const r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    host.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

    build();
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 120); });

    requestAnimationFrame(frame);
  }

  function boot() {
    document.querySelectorAll('[data-ctadots]').forEach(setup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
