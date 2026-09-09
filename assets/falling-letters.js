/* Falling letters hero — Matter.js physics.
   Usage: <div data-falling-letters data-words="DIGITALE|KOMPETENZ"></div>
   Loads Matter locally (assets/vendor/matter.min.js) if not present. Letters are draggable.
   Pauses the simulation when the hero scrolls out of view.
   Jede Instanz besitzt einen destroy()-Pfad; der Resize-Handler wird nur
   einmal pro Container registriert (kein Leak, keine Duplikate beim Rebuild). */
(function () {
  function hexFromVar(el, name, fallback) {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }

  function boot() {
    const containers = document.querySelectorAll('[data-falling-letters]');
    if (!containers.length) return;
    if (typeof Matter === 'undefined') { setTimeout(boot, 120); return; }

    containers.forEach(setup);
  }

  // Resize-Handler genau EINMAL pro Container. Er räumt die aktive Instanz
  // über destroy() ab und baut anschliessend genau eine neue Instanz über den
  // Router auf (der wählt Mobile- oder Desktop-Variante).
  function ensureResize(container) {
    if (container.__flResize) return;
    let rT;
    const onResize = () => {
      clearTimeout(rT);
      rT = setTimeout(() => {
        const inst = container.__flInstance;
        if (!inst) return;
        const w = container.clientWidth;
        if (Math.abs(w - inst.width) < 40) return;
        inst.destroy();
        (window.__flSetupAny || setup)(container);
      }, 250);
    };
    window.addEventListener('resize', onResize);
    container.__flResize = onResize;
  }

  function setup(container) {
    if (container.__fl) return;
    // Mobile (<640px): eigene Variante mit VINCENT + Gyro übernehmen
    if (container.clientWidth < 640 && window.__flMobileSetup) {
      window.__flMobileSetup(container);
      return;
    }
    container.__fl = true;
    ensureResize(container);

    const { Engine, Render, Bodies, Composite, Body, MouseConstraint, Mouse, Events } = Matter;

    let width = container.clientWidth;
    const isMobile = width < 640;
    const height = container.clientHeight || (isMobile ? 460 : 620);
    container.style.position = 'relative';

    const inkCol    = hexFromVar(container, '--ink', '#111111');

    const rawWords = (container.dataset.words || 'DIGITALE|KOMPETENZ').split('|');
    // Case mode comes from the Tweaks panel (data-letter-case on <html>):
    // 'Versalien' = UPPERCASE, 'Normal' = exactly as written in data-words.
    function caseMode() {
      return document.documentElement.getAttribute('data-letter-case') || 'Versalien';
    }
    function applyCase(arr) {
      return caseMode() === 'Normal' ? arr.slice() : arr.map(w => w.toUpperCase());
    }
    let words = applyCase(rawWords);

    // --- Exact parameters from the original template (do not "improve") ---
    const baseFontSize = isMobile ? 100 : 200;
    let fontSize = baseFontSize;
    // Headline typeface follows the live --font-head token (set by the Tweaks
    // font switcher) so the hero letters change with the rest of the site.
    function headFamily() {
      const v = getComputedStyle(container).getPropertyValue('--font-head').trim();
      return v || 'Arial, sans-serif';
    }
    // Weight follows the Tweaks "Titel — Stärke" axis (--weight-head).
    function headWeight() {
      const v = getComputedStyle(container).getPropertyValue('--weight-head').trim();
      return v || '900';
    }
    let fontFamily = headFamily();
    let fontWeight = headWeight();
    let fontStyle = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const bounciness = 0.7, friction = 0.02, airResistance = 0.015;
    const dropHeight = -500;

    // Alle Timer dieser Instanz merken, damit destroy() sie abräumen kann.
    const timers = new Set();
    function later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    }

    // Shrink the font so the WIDEST word fits on a single line. Otherwise the
    // last letters (e.g. the Z of KOMPETENZ) overflow and the wrap logic kicks
    // them onto their own row at the far left, where they fall in isolation.
    function fitFont() {
      fontSize = baseFontSize;
      fontStyle = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const startPad = 20;
      const mc2 = document.createElement('canvas').getContext('2d');
      mc2.font = fontStyle;
      const spacing = fontSize * 0.05;
      let maxW = 0;
      words.forEach(w => {
        let tot = 0;
        w.split('').forEach(ch => { tot += mc2.measureText(ch).width + spacing; });
        maxW = Math.max(maxW, tot);
      });
      const avail = width - startPad * 2;
      if (maxW > avail && maxW > 0) {
        fontSize = Math.floor(fontSize * (avail / maxW));
        fontStyle = `${fontWeight} ${fontSize}px ${fontFamily}`;
      }
    }
    fitFont();

    const engine = Engine.create();
    engine.world.gravity.y = isMobile ? 2.6 : 2.2;
    container.__engine = engine; window.__flEngine = engine;

    const render = Render.create({
      element: container,
      engine: engine,
      options: { width, height, wireframes: false, background: 'transparent', pixelRatio: Math.min(window.devicePixelRatio || 1, 2) }
    });

    const wallOpt = { isStatic: true, render: { visible: false }, friction: 0.1, restitution: 0.4 };
    const walls = [
      Bodies.rectangle(width / 2, height + 50, 6000, 100, wallOpt),
      Bodies.rectangle(-50, height / 2, 100, 6000, wallOpt),
      Bodies.rectangle(width + 50, height / 2, 100, 6000, wallOpt)
    ];
    Composite.add(engine.world, walls);

    function makeLetter(char, x, y, color) {
      const c = document.createElement('canvas');
      const cx = c.getContext('2d');
      cx.font = fontStyle;
      const w = cx.measureText(char).width;
      const h = fontSize * 0.74;
      const body = Bodies.rectangle(x, y, w, h, {
        restitution: bounciness, friction: friction, frictionAir: airResistance,
        render: { fillStyle: 'transparent', strokeStyle: 'transparent', text: { content: char, font: fontStyle, color: color, z: Math.random() } }
      });
      Body.setAngle(body, (Math.random() - 0.5) * 0.15);
      return body;
    }

    const startX = 20;

    function spawnWord(word, color, delay) {
      later(() => {
        const c = document.createElement('canvas');
        const cx = c.getContext('2d');
        cx.font = fontStyle;
        let runningX = startX;
        let currentYOffset = dropHeight;
        const spacing = fontSize * 0.05;
        word.split('').forEach((char, index) => {
          const charWidth = cx.measureText(char).width;
          if (runningX + charWidth > width - 20) {
            runningX = startX;
            currentYOffset -= (fontSize * 0.85);
          }
          const xCenter = runningX + charWidth / 2;
          const yCenter = currentYOffset;
          const letterDelay = isMobile ? (index * 150) : 0;
          later(() => {
            Composite.add(engine.world, makeLetter(char, xCenter, yCenter, color));
          }, letterDelay);
          runningX += charWidth + spacing;
        });
      }, delay);
    }

    let startedSpawn = false;
    function startSpawns() {
      if (startedSpawn) return;
      startedSpawn = true;
      words.forEach((w, i) => {
        // Erstes Wort sofort beim Laden, Folgewörter im gewohnten Abstand.
        spawnWord(w, inkCol, i * 2500);
      });
    }

    function clearLetters() {
      Composite.allBodies(engine.world).forEach(b => { if (b.render.text) Composite.remove(engine.world, b); });
    }

    // draw text aligned to bodies
    Events.on(render, 'afterRender', () => {
      const ctx = render.context;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Farbe live aus --ink lesen, damit Hell/Dunkel-Wechsel sofort greift
      const liveInk = hexFromVar(container, '--ink', '#111111');
      // Paint in a stable randomized order so no single letter (e.g. the last
      // one spawned) is permanently on top of the pile.
      const letters = Composite.allBodies(engine.world).filter(b => b.render.text);
      letters.sort((a, b) => a.render.text.z - b.render.text.z);
      letters.forEach(b => {
        const { content, font } = b.render.text;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        ctx.font = font;
        ctx.fillStyle = liveInk;
        ctx.fillText(content, 0, fontSize * 0.06);
        ctx.restore();
      });
    });

    const mouse = Mouse.create(render.canvas);
    const mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
    mouse.element.removeEventListener('mousewheel', mouse.mousewheel);
    mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel);
    Composite.add(engine.world, mc);
    render.canvas.style.cursor = 'grab';
    Events.on(mc, 'startdrag', () => render.canvas.style.cursor = 'grabbing');
    Events.on(mc, 'enddrag', () => render.canvas.style.cursor = 'grab');

    // Hover interaction: letters react when the cursor passes over them
    // (no mouse button needed). Tracks whether the pointer is over the canvas.
    let over = false;
    render.canvas.addEventListener('mouseenter', () => over = true);
    render.canvas.addEventListener('mousemove', () => over = true);
    render.canvas.addEventListener('mouseleave', () => over = false);
    const HOVER_R = isMobile ? 110 : 160;
    const HOVER_STRENGTH = 0.006;
    function applyHover() {
      if (!over || mc.body) return; // skip while dragging or pointer outside
      const mx = mouse.position.x, my = mouse.position.y;
      const bodies = Composite.allBodies(engine.world);
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!b.render.text) continue;
        const dx = b.position.x - mx, dy = b.position.y - my;
        const dist = Math.hypot(dx, dy);
        if (dist < HOVER_R && dist > 0.5) {
          const p = 1 - dist / HOVER_R;
          const f = p * b.mass * HOVER_STRENGTH;
          Body.applyForce(b, b.position, { x: (dx / dist) * f, y: (dy / dist) * f });
        }
      }
    }

    Render.run(render);
    container.__render = render; window.__flRender = render;
    // Match the absolutely-positioned overlay pattern (keeps siblings painting + capture-safe)
    render.canvas.style.position = 'absolute';
    render.canvas.style.top = '0';
    render.canvas.style.left = '0';
    render.canvas.style.zIndex = '1';

    // Drive the simulation with our own rAF loop (more reliable than Runner
    // in embedded iframes). Visibility just toggles `paused`.
    let paused = false;
    let destroyed = false;
    let rafId = 0;
    let last = performance.now();
    function tick(now) {
      if (destroyed) return;
      const dt = Math.min(32, (now || performance.now()) - last);
      last = now || performance.now();
      if (!paused) { applyHover(); Engine.update(engine, dt); }
      rafId = requestAnimationFrame(tick);
    }
    tick(performance.now());

    startSpawns();

    // Rebuild the letters when the Tweaks font switcher changes --font-head
    // or the case mode (Versalien/Normal) changes, so the hero tracks the
    // rest of the site.
    let lastCase = caseMode();
    function onTweaks() {
      const fam = headFamily();
      const wgt = headWeight();
      const cs = caseMode();
      if (fam === fontFamily && wgt === fontWeight && cs === lastCase) return;
      fontFamily = fam;
      fontWeight = wgt;
      lastCase = cs;
      words = applyCase(rawWords);
      fitFont();
      clearLetters();
      startedSpawn = false;
      startSpawns();
    }
    document.addEventListener('tweaks:apply', onTweaks);

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { startSpawns(); paused = false; }
        else { paused = true; }
      });
    }, { threshold: 0 });
    io.observe(container);

    // reset button support
    const resetBtn = document.querySelector(container.dataset.reset || '');
    function onReset() {
      clearLetters();
      startedSpawn = false;
      startSpawns();
    }
    if (resetBtn) resetBtn.addEventListener('click', onReset);

    // Vollständiger Abbau dieser Instanz: Tick-Schleife, Observer, Listener,
    // offene Timer, Canvas und Engine. Danach darf setup() neu aufbauen.
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      paused = true;
      cancelAnimationFrame(rafId);
      timers.forEach(clearTimeout);
      timers.clear();
      io.disconnect();
      document.removeEventListener('tweaks:apply', onTweaks);
      if (resetBtn) resetBtn.removeEventListener('click', onReset);
      Events.off(mc);
      Events.off(render);
      Render.stop(render);
      render.canvas.remove();
      Composite.clear(engine.world, false, true);
      Engine.clear(engine);
      if (container.__engine === engine) container.__engine = null;
      if (container.__render === render) container.__render = null;
      if (window.__flEngine === engine) window.__flEngine = null;
      if (window.__flRender === render) window.__flRender = null;
      if (container.__flInstance === inst) container.__flInstance = null;
      container.__fl = false;
    }

    const inst = { width, destroy };
    container.__flInstance = inst;
  }

  // Router für Rebuilds (Resize über den Breakpoint hinweg)
  window.__flSetupAny = setup;

  // load Matter then boot
  if (typeof Matter === 'undefined') {
    const s = document.createElement('script');
    s.src = 'assets/vendor/matter.min.js';
    s.onload = boot;
    document.head.appendChild(s);
  } else {
    boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();