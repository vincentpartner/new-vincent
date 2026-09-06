/* Interactive fine dot grid, scoped to a container.
   Usage: <div data-dotgrid></div>  (canvas fills the element)
   Dots scatter away from the pointer and ease back. Pauses offscreen. */
(function () {
  function init(host) {
    if (host.__dg) return;
    host.__dg = true;
    host.style.position = host.style.position || 'relative';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;';
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');

    const cfg = {
      spacing: parseInt(host.dataset.spacing || '26', 10),
      radius: parseFloat(host.dataset.dot || '1.4'),
      mouseR: parseFloat(host.dataset.radius || '120'),
      force: parseFloat(host.dataset.force || '0.09'),
      ret: 0.06
    };
    let color = getComputedStyle(host).getPropertyValue('--dot-color').trim()
      || getComputedStyle(host).getPropertyValue('--ink').trim() || '#111';
    let opacity = parseFloat(host.dataset.opacity || '0.5');

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let pts = [];
    let mouse = { x: -9999, y: -9999 };
    let w = 0, h = 0, running = false, raf = 0;

    function build() {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = [];
      for (let x = cfg.spacing / 2; x < w; x += cfg.spacing)
        for (let y = cfg.spacing / 2; y < h; y += cfg.spacing)
          pts.push({ x, y, ox: x, oy: y });
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < cfg.mouseR) {
          const a = Math.atan2(dy, dx);
          const push = (cfg.mouseR - dist) * cfg.force;
          p.x -= Math.cos(a) * push;
          p.y -= Math.sin(a) * push;
        }
        p.x += (p.ox - p.x) * cfg.ret;
        p.y += (p.oy - p.y) * cfg.ret;
        // size grows slightly near pointer
        const boost = dist < cfg.mouseR ? (1 - dist / cfg.mouseR) * 0.9 : 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, cfg.radius + boost, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!running) { running = true; frame(); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    window.addEventListener('mousemove', (e) => {
      const r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    window.addEventListener('mouseout', () => { mouse.x = -9999; mouse.y = -9999; });

    const io = new IntersectionObserver((es) => {
      es.forEach(e => e.isIntersecting ? start() : stop());
    }, { threshold: 0.01 });
    io.observe(host);

    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 150); });

    build();
  }

  function boot() { document.querySelectorAll('[data-dotgrid]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
