/* Falling letters hero — Matter.js physics.
   Usage: <div data-falling-letters data-words="DIGITALE|KOMPETENZ"></div>
   Loads Matter from CDN if not present. Letters are draggable.
   Pauses the runner when the hero scrolls out of view. */
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

  function setup(container) {
    if (container.__fl) return;
    // Mobile (<640px): eigene Variante mit VINCENT + Gyro übernehmen
    if (container.clientWidth < 640 && window.__flMobileSetup) {
      window.__flMobileSetup(container);
      return;
    }
    container.__fl = true;
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
    let dead = false, raf = 0;

    const { Engine, Render, Runner, Bodies, Composite, Body, MouseConstraint, Mouse, Events } = Matter;

    let width = container.clientWidth;
    const isMobile = width < 640;
    const height = container.clientHeight || (isMobile ? 460 : 620);
    container.style.position = 'relative';

    const inkCol    = hexFromVar(container, '--ink', '#111111');
    const accentCol = hexFromVar(container, '--accent', '#FF2B00');

    const rawWords = (container.dataset.words || 'DIGITALE|KOMPETENZ').split('|');
    // Case mode comes from the Tweaks panel (data-letter-case on <html>):
    // 'Versalien' = UPPERCASE, 'Normal' = exactly as written in data-words.
    function caseMode() {
      return document.documentElement.getAttribute('data-letter-case') || 'Versalien';
    }
    // Optional per word: data-word-case="upper|as-is" and data-word-weights="900|400" (pipe-separated, same order as data-words).
    const wordCase = (container.dataset.wordCase || '').split('|');
    const wordWeights = (container.dataset.wordWeights || '').split('|');
    const wordSizes = (container.dataset.wordSizes || '').split('|').map(v => parseFloat(v) || 1);
    function wordSize(i) { return fontSize * (wordSizes[i] || 1); }
    function applyCase(arr) {
      return arr.map((w, i) => wordCase[i] === 'as-is' ? w : (wordCase[i] === 'upper' || caseMode() !== 'Normal') ? w.toUpperCase() : w);
    }
    let words = applyCase(rawWords);
    function wordFont(i) { return `${wordWeights[i] || fontWeight} ${wordSize(i)}px ${fontFamily}`; }

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
      words.forEach((w, i) => {
        let tot = 0;
        mc2.font = wordFont(i);
        const sp = wordSize(i) * 0.05;
        w.split('').forEach(ch => { tot += mc2.measureText(ch).width + sp; });
        tot += sp; // Sicherheitsreserve gegen Umbruch des letzten Buchstabens
        maxW = Math.max(maxW, tot);
      });
      const avail = width - startPad * 2;
      if (maxW > 0 && (maxW > avail || container.hasAttribute('data-fit-width'))) {
        fontSize = Math.floor(fontSize * (avail / maxW) * (parseFloat(container.dataset.fitScale) || 1));
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

    function makeLetter(char, x, y, color, font, size) {
      font = font || fontStyle; size = size || fontSize;
      const c = document.createElement('canvas');
      const cx = c.getContext('2d');
      cx.font = font;
      const w = cx.measureText(char).width;
      const h = size * 0.74;
      const body = Bodies.rectangle(x, y, w, h, {
        restitution: bounciness, friction: friction, frictionAir: airResistance,
        render: { fillStyle: 'transparent', strokeStyle: 'transparent', text: { content: char, font: font, size: size, color: color, z: Math.random() } }
      });
      Body.setAngle(body, (Math.random() - 0.5) * 0.15);
      return body;
    }

    const startX = 20;

    function spawnWord(word, color, delay, wi) {
      later(() => {
        const font = wordFont(wi || 0);
        const size = wordSize(wi || 0);
        const c = document.createElement('canvas');
        const cx = c.getContext('2d');
        cx.font = font;
        let runningX = startX;
        let currentYOffset = dropHeight;
        const spacing = size * 0.05;
        word.split('').forEach((char, index) => {
          const charWidth = cx.measureText(char).width;
          if (runningX + charWidth > width - 20) {
            runningX = startX;
            currentYOffset -= (size * 0.85);
          }
          const xCenter = runningX + charWidth / 2;
          const yCenter = currentYOffset;
          const letterDelay = (isMobile && !REDUCED) ? (index * 150) : 0;
          later(() => {
            Composite.add(engine.world, makeLetter(char, xCenter, yCenter, color, font, size));
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
        spawnWord(w, inkCol, REDUCED ? 0 : i * 2500, i);
      });
      // Bewegung reduzieren: Buchstaben sofort fertig liegend zeigen (einmal vorrechnen, kein Loop)
      if (REDUCED) later(() => { for (let k = 0; k < 420; k++) Engine.update(engine, 16); Render.world(render); }, 30);
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
        const { content, font, size } = b.render.text;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        ctx.font = font;
        ctx.fillStyle = liveInk;
        ctx.fillText(content, 0, (size || fontSize) * 0.06);
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

    if (!REDUCED) Render.run(render);
    container.__render = render; window.__flRender = render;
    // Match the absolutely-positioned overlay pattern (keeps siblings painting + capture-safe)
    render.canvas.style.position = 'absolute';
    render.canvas.style.top = '0';
    render.canvas.style.left = '0';
    render.canvas.style.zIndex = '1';

    // Drive the simulation with our own rAF loop (more reliable than Runner
    // in embedded iframes). Visibility just toggles `paused`.
    let paused = false, rendering = !REDUCED;
    let last = performance.now();
    function setPaused(p) {
      paused = p;
      if (REDUCED || dead) return;
      if (p && rendering) { Render.stop(render); rendering = false; }
      else if (!p && !rendering) { Render.run(render); rendering = true; last = performance.now(); }
    }
    function tick(now) {
      if (dead) return;
      const dt = Math.min(32, (now || performance.now()) - last);
      last = now || performance.now();
      if (!paused) { applyHover(); Engine.update(engine, dt); }
      raf = requestAnimationFrame(tick);
    }
    if (!REDUCED) tick(performance.now());

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
      Composite.allBodies(engine.world).forEach(b => { if (b.render.text) Composite.remove(engine.world, b); });
      timers.forEach(clearTimeout); timers.clear();
      startedSpawn = false;
      startSpawns();
    }
    document.addEventListener('tweaks:apply', onTweaks);

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { startSpawns(); setPaused(false); }
        else { setPaused(true); }
      });
    }, { threshold: 0 });
    io.observe(container);

    // reset button support
    const resetBtn = document.querySelector(container.dataset.reset || '');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        Composite.allBodies(engine.world).forEach(b => { if (b.render.text) Composite.remove(engine.world, b); });
        startedSpawn = false;
        startSpawns();
      });
    }

    let rT;
    function onResize() {
      clearTimeout(rT);
      rT = setTimeout(() => {
        const w = container.clientWidth;
        if (Math.abs(w - width) < 40) return;
        destroy();
        setup(container);
      }, 250);
    }
    window.addEventListener('resize', onResize);

    // Vollständig abbauen: Handler, Observer, Timer, rAF, Matter-Engine/Render (genau eine Instanz pro Container)
    function destroy() {
      if (dead) return; dead = true;
      clearTimeout(rT); timers.forEach(clearTimeout); timers.clear();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('tweaks:apply', onTweaks);
      io.disconnect();
      try { Render.stop(render); } catch (e) {}
      try { Mouse.clearSourceEvents && Mouse.clearSourceEvents(mouse); } catch (e) {}
      Composite.clear(engine.world, false); Engine.clear(engine);
      render.canvas.remove(); render.textures = {};
      container.__fl = false; container.__flDestroy = null;
    }
    container.__flDestroy = destroy;
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
