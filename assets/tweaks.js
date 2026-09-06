/* Shared Tweaks for the Vincent & Partner site (vanilla, multi-page).
   Persists to localStorage so settings survive navigation, applies CSS vars
   to :root, and speaks the host edit-mode protocol so the toolbar toggle works. */
(function () {
  const LS_KEY = 'vp_tweaks_v1';

  const DEFAULTS = /*EDITMODE-BEGIN*/{
    "accent": "#2A2D31",
    "mode": "Hell",
    "fontHead": "Bricolage",
    "fontBody": "Bricolage",
    "tracking": -0.03,
    "trackBody": -0.005,
    "weightHead": 600,
    "weightBody": 400,
    "colorHead": "",
    "hero": "Buchstaben",
    "letterCase": "Versalien",
    "textColor": "",
    "accentGradient": "",
    "gradColors": ["#2A6FDB", "#7A5CFF", "#1F8A5B"],
    "accentLogoV": false,
    "accentLogoP": false,
    "logoCaseV": "Versalien",
    "logoCaseP": "Versalien"
  }/*EDITMODE-END*/;

  const ACCENTS = [
    { label: "Anthrazit", val: "#2A2D31", on: "#FFFFFF" },
    { label: "Tiefschwarz", val: "#111111", on: "#FFFFFF" },
    { label: "Stahlgrau", val: "#6E7378", on: "#FFFFFF" },
    { label: "Klein-Blau", val: "#1A33E0", on: "#FFFFFF" }
  ];
  // 7 variable grotesque fonts — weight axis controlled live via the sliders below.
  const FONTS = {
    "Bricolage":        { sub: "Charaktervoll · grotesk", head: "'Bricolage Grotesque', Arial, sans-serif", body: "'Bricolage Grotesque', Arial, sans-serif" },
    "Familjen":         { sub: "Nüchtern · grotesk",      head: "'Familjen Grotesk', Arial, sans-serif", body: "'Familjen Grotesk', Arial, sans-serif" },
    "Gabarito":         { sub: "Warm · grotesk",          head: "'Gabarito', Arial, sans-serif", body: "'Gabarito', Arial, sans-serif" },
    "Hanken":           { sub: "Präzis · grotesk",        head: "'Hanken Grotesk', Arial, sans-serif", body: "'Hanken Grotesk', Arial, sans-serif" },
    "Schibsted":        { sub: "Redaktionell · grotesk",  head: "'Schibsted Grotesk', Arial, sans-serif", body: "'Schibsted Grotesk', Arial, sans-serif" },
    "Onest":            { sub: "Klar · grotesk",          head: "'Onest', Arial, sans-serif", body: "'Onest', Arial, sans-serif" },
    "Wix Display":      { sub: "Markant · grotesk",       head: "'Wix Madefor Display', Arial, sans-serif", body: "'Wix Madefor Display', Arial, sans-serif" }
  };

  let state = load();
  let modeToggle = null;

  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) {}
    // Migrate the old single "font" key to the split head/body keys.
    if (s.font && !s.fontHead) s.fontHead = s.font;
    if (s.font && !s.fontBody) s.fontBody = s.font;
    // One-off migration of the old monochrome accent (identical to --ink). Guarded by
    // a flag so a deliberate "Anthrazit" pick survives later reloads.
    // Akzent auf Anthrazit zurücksetzen (keine Brandfarbe mehr) — einmalig.
    if (!s.accentAnthrazit) {
      s.accent = DEFAULTS.accent;
      s.accentGradient = '';
      s.accentAnthrazit = true;
    }
    return Object.assign({}, DEFAULTS, s);
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  function lumTextOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#FFFFFF';
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return L > 0.62 ? '#111111' : '#FFFFFF';
  }

  // Lift a too-dark accent to a readable light tone for dark mode (keeps hue).
  // Monochrome anthracite/black accents become a light grey ink; coloured
  // accents stay tinted but readable on the dark canvas. Returns null if the
  // colour is already light enough (or not a hex) so we leave it untouched.
  function liftForDark(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (L >= 0.6) return null;
    const w = Math.min(0.85, (0.80 - L) / (1 - L));
    r = Math.round(r + (255 - r) * w);
    g = Math.round(g + (255 - g) * w);
    b = Math.round(b + (255 - b) * w);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function apply() {
    const root = document.documentElement;
    if (state.accentGradient) {
      root.style.setProperty('--accent-gradient', state.accentGradient);
      root.setAttribute('data-accent-grad', '1');
      const first = (state.accentGradient.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/) || [])[0] || state.accent || '#2A2D31';
      root.style.setProperty('--accent', first);
      root.style.setProperty('--on-accent', lumTextOn(first));
    } else {
      root.removeAttribute('data-accent-grad');
      const preset = ACCENTS.find(a => a.val === state.accent);
      const solid = state.accent || ACCENTS[0].val;
      root.style.setProperty('--accent', solid);
      root.style.setProperty('--accent-gradient', solid);
      root.style.setProperty('--on-accent', preset ? preset.on : lumTextOn(solid));
    }
    root.setAttribute('data-accent-logo-v', state.accentLogoV ? '1' : '0');
    root.setAttribute('data-accent-logo-p', state.accentLogoP ? '1' : '0');
    root.setAttribute('data-logo-v', state.logoCaseV || 'Versalien');
    root.setAttribute('data-logo-p', state.logoCaseP || 'Versalien');
    // Brush gradient always reflects the configured gradient colors.
    root.style.setProperty('--brush-gradient', 'linear-gradient(90deg, ' + (state.gradColors || ['#2A6FDB','#7A5CFF']).join(', ') + ')');

    const fh = FONTS[state.fontHead] || FONTS[state.font] || FONTS['Bricolage'];
    const fb = FONTS[state.fontBody] || FONTS[state.font] || FONTS['Bricolage'];
    root.style.setProperty('--font-head', fh.head);
    root.style.setProperty('--font-body', fb.body);
    root.style.setProperty('--track-head', state.tracking + 'em');
    root.style.setProperty('--track-body', (state.trackBody != null ? state.trackBody : -0.005) + 'em');
    root.style.setProperty('--weight-head', state.weightHead);
    root.style.setProperty('--weight-body', state.weightBody);

    // Base ink from the mode — titles follow THIS (independent of body colour).
    // Dark-mode ink is a soft light grey (NOT pure/near-white) so body copy and
    // headlines stay comfortably readable without glaring. Headlines (modeInk)
    // sit a touch brighter than primary body text for hierarchy.
    const modeInk = state.mode === 'Dunkel' ? '#DEE0DD' : '#2A2D31';
    if (state.mode === 'Dunkel') {
      root.style.setProperty('--bg', '#1B1D20');
      root.style.setProperty('--paper', '#23262A');
      root.style.setProperty('--ink', '#D2D4D2');
      root.style.setProperty('--line', '#3A3E43');
      root.style.setProperty('--muted', '#969A9E');
    } else {
      root.style.setProperty('--bg', '#FFFFFF');
      root.style.setProperty('--paper', '#EFEFEC');
      root.style.setProperty('--ink', '#2A2D31');
      root.style.setProperty('--line', '#DAD9D4');
      root.style.setProperty('--muted', '#9A9D9F');
    }
    root.setAttribute('data-mode', state.mode);
    // Accent readability in dark mode: the monochrome/dark accents (Anthrazit,
    // Tiefschwarz, …) are invisible on the dark canvas. Lift any too-dark accent
    // to a readable light tone so accent TEXT (.accent / .rand-accent / section
    // indices / nav underline / brand &) stays visible. Light/coloured accents
    // that already read fine are left untouched.
    if (state.mode === 'Dunkel') {
      const base = state.accentGradient
        ? ((state.accentGradient.match(/#[0-9a-fA-F]{6}/) || [])[0] || state.accent || ACCENTS[0].val)
        : (state.accent || ACCENTS[0].val);
      const lit = liftForDark(base);
      if (lit) {
        root.style.setProperty('--accent', lit);
        if (!state.accentGradient) root.style.setProperty('--accent-gradient', lit);
        root.style.setProperty('--on-accent', lumTextOn(lit));
      }
    }
    // Optional body-text colour override (Tweaks). The colour swatches are dark
    // anthracite tones meant for LIGHT mode only — applying them in dark mode
    // would turn the type dark and unreadable. So in dark mode we ALWAYS keep the
    // soft light-grey mode defaults, regardless of any persisted override.
    const isDark = state.mode === 'Dunkel';
    if (state.textColor && !isDark) {
      root.style.setProperty('--ink', state.textColor);
      // Body paragraph colour follows the chosen body colour too.
      root.style.setProperty('--body-ink', state.textColor);
    } else {
      root.style.removeProperty('--body-ink');
    }
    // Title colour: explicit override (light mode only), else follow the MODE ink
    // so dark-mode titles stay a readable soft light grey.
    root.style.setProperty('--ink-head', (state.colorHead && !isDark) ? state.colorHead : modeInk);
    if (modeToggle) modeToggle.classList.toggle('dark', state.mode === 'Dunkel');
    root.setAttribute('data-hero', state.hero);
    root.setAttribute('data-letter-case', state.letterCase || 'Versalien');
    document.dispatchEvent(new CustomEvent('tweaks:apply', { detail: state }));
  }

  function set(key, val) {
    state[key] = val;
    save(); apply(); syncUI();
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
  }

  const RAND_COLORS = ['#2A6FDB','#1F8A5B','#7A5CFF','#E0851A','#159E9E','#C0392B','#D81B8C','#3D5AFE','#0EA5A5','#7C3AED','#16A34A','#EA580C'];
  function randomizeAccent() {
    const c = RAND_COLORS[Math.floor(Math.random() * RAND_COLORS.length)];
    state.accentGradient = '';
    state.accentWords = true;
    state.accentLogoV = false;
    state.accentLogoP = false;
    if (ui.solidInp) ui.solidInp.value = c;
    set('accent', c);            // saves + applies + syncs
    highlightRandomWords();
  }

  function highlightRandomWords() {
    document.querySelectorAll('span.rand-accent').forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
    if (!state.accentWords) return;
    const heads = document.querySelectorAll('.ptitle, .h-giant, .winfo h3, .focus-head h2, .h-1, .h-2, .svc-item .ttl');
    heads.forEach(h => {
      if (h.querySelector('.accent, .accentline, .rand-accent')) return;
      if (Math.random() < 0.4) return;
      const parts = h.innerHTML.split(/(<br\s*\/?>)/i);
      const txtIdx = [];
      parts.forEach((p, i) => { if (!/^<br/i.test(p) && p.replace(/<[^>]*>/g,'').trim()) txtIdx.push(i); });
      if (!txtIdx.length) return;
      const pi = txtIdx[Math.floor(Math.random() * txtIdx.length)];
      if (/[<>]/.test(parts[pi])) return; // avoid segments with tags
      const words = parts[pi].split(/(\s+)/);
      const wi = [];
      words.forEach((w, i) => { if (w.trim()) wi.push(i); });
      if (!wi.length) return;
      const pick = wi[Math.floor(Math.random() * wi.length)];
      words[pick] = '<span class="rand-accent">' + words[pick] + '</span>';
      parts[pi] = words.join('');
      h.innerHTML = parts.join('');
    });
  }
  window.VPRandomAccent = randomizeAccent;

  /* ---- Brush: highlight text (word/letters) → apply Farbe or Verlauf ---- */
  const PAINT_KEY = 'vp_paint_v1';
  function pageKey() { return location.pathname.split('/').pop() || 'index.html'; }
  function loadPaint() { try { return JSON.parse(localStorage.getItem(PAINT_KEY)) || {}; } catch (e) { return {}; } }
  function savePaintList(list) { const all = loadPaint(); all[pageKey()] = list; try { localStorage.setItem(PAINT_KEY, JSON.stringify(all)); } catch (e) {} }
  function paintList() { const v = loadPaint()[pageKey()] || []; return v.filter(o => o && typeof o === 'object'); }
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      const p = el.parentNode;
      if (p) {
        const sibs = Array.prototype.filter.call(p.children, c => c.nodeName === el.nodeName);
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(el) + 1) + ')';
      }
      parts.unshift(sel);
      el = el.parentNode;
    }
    return 'body > ' + parts.join(' > ');
  }
  function textNodesUnder(root) {
    const out = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n; while (n = w.nextNode()) out.push(n); return out;
  }

  // Apply a stored op: wrap the [start,len] range inside the ancestor element.
  function applyWord(op) {
    const anc = document.querySelector(op.sel); if (!anc) return null;
    const nodes = textNodesUnder(anc); let acc = 0, target = null, off = 0;
    for (const node of nodes) {
      const L = node.nodeValue.length;
      if (op.start >= acc && op.start < acc + L) {
        if (op.start + op.len > acc + L) return null;   // spans a boundary → skip
        target = node; off = op.start - acc; break;
      }
      acc += L;
    }
    if (!target) return null;
    const range = document.createRange(); range.setStart(target, off); range.setEnd(target, off + op.len);
    const span = document.createElement('span');
    span.className = 'vp-paint-' + (op.mode || 'solid') + ' vp-word';
    span.dataset.vpw = op.sel + '\u241F' + op.start + '\u241F' + op.len;
    try { range.surroundContents(span); } catch (e) { return null; }
    return span;
  }
  function clearPaint() {
    document.querySelectorAll('span.vp-word').forEach(sp => { const p = sp.parentNode; if (!p) return; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); p.removeChild(sp); p.normalize(); });
  }
  function applyPaint() {
    clearPaint();
    paintList().forEach(op => { if (op.k === 'w') applyWord(op); });
  }

  let brushOn = false, lastRange = null;
  function setBrush(on, btn) {
    brushOn = on;
    document.documentElement.classList.toggle('vp-brush', on);
    if (btn) { btn.textContent = on ? '🖌 Pinsel: AN' : '🖌 Pinsel: aus'; btn.classList.toggle('on', on); }
    if (ui.brushApply) ui.brushApply.style.display = on ? 'flex' : 'none';
    if (ui.brushHint) ui.brushHint.style.display = on ? 'block' : 'none';
    if (!on) lastRange = null;
  }
  function inPanel(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el && el.closest && el.closest('.vptw');
  }

  // Remember the user's text selection while the brush is on.
  document.addEventListener('mouseup', function () {
    if (!brushOn) return;
    setTimeout(function () {
      const s = window.getSelection();
      if (s && s.rangeCount && !s.isCollapsed) {
        const r = s.getRangeAt(0);
        if (!inPanel(r.commonAncestorContainer)) lastRange = r.cloneRange();
      }
    }, 0);
  });

  // Click a painted word to remove it (toggle off).
  document.addEventListener('click', function (e) {
    if (!brushOn) return;
    if (inPanel(e.target)) return;
    const painted = e.target.closest && e.target.closest('span.vp-word');
    if (painted) {
      e.preventDefault(); e.stopPropagation();
      const sig = (painted.dataset.vpw || '').split('\u241F');
      const list = paintList().filter(o => !(o.k === 'w' && o.sel === sig[0] && String(o.start) === sig[1] && String(o.len) === sig[2]));
      savePaintList(list); applyPaint();
      const sel = window.getSelection(); if (sel) sel.removeAllRanges();
    }
  }, true);

  // Paint the current/last selection with a solid color ('solid') or gradient ('grad').
  function applySelection(mode) {
    if (!brushOn) return;
    let range = null;
    const s = window.getSelection();
    if (s && s.rangeCount && !s.isCollapsed && !inPanel(s.getRangeAt(0).commonAncestorContainer)) range = s.getRangeAt(0);
    else if (lastRange) range = lastRange;
    if (!range) { flashHint('Bitte zuerst Text markieren.'); return; }

    const sc = range.startContainer, ec = range.endContainer;
    if (sc.nodeType !== 3 || sc !== ec) { flashHint('Bitte Text innerhalb einer Zeile markieren.'); return; }
    // climb past transient spans (random highlight / previous paint) to a stable ancestor
    let anc = sc.parentNode;
    while (anc && anc !== document.body && anc.classList &&
      (anc.classList.contains('rand-accent') || anc.classList.contains('vp-word') ||
       anc.classList.contains('vp-paint-solid') || anc.classList.contains('vp-paint-grad'))) {
      anc = anc.parentNode;
    }
    if (!anc || inPanel(anc)) return;
    if (anc.closest && anc.closest('.brand')) { flashHint('Das Logo kann nicht eingefärbt werden.'); return; }
    const sel = cssPath(anc);
    const nodes = textNodesUnder(anc); let acc = 0, start = -1;
    for (const tn of nodes) { if (tn === sc) { start = acc + range.startOffset; break; } acc += tn.nodeValue.length; }
    if (start < 0) return;
    const len = range.endOffset - range.startOffset;
    if (len <= 0) { flashHint('Bitte zuerst Text markieren.'); return; }

    const list = paintList().filter(o => !(o.k === 'w' && o.sel === sel && o.start === start && o.len === len));
    list.push({ k: 'w', sel: sel, start: start, len: len, mode: mode });
    savePaintList(list); applyPaint();
    const ws = window.getSelection(); if (ws) ws.removeAllRanges();
    lastRange = null;
  }
  function flashHint(msg) {
    if (!ui.brushHint) return;
    const prev = ui.brushHint.textContent;
    ui.brushHint.textContent = msg; ui.brushHint.style.color = 'var(--accent, #FF2B00)';
    setTimeout(function () { ui.brushHint.textContent = prev; ui.brushHint.style.color = ''; }, 1800);
  }
  window.VPApplyPaint = applyPaint;

  // Webfonts liegen lokal: assets/fonts.css (im <head> jeder Seite eingebunden).

  // re-apply random word highlighting on each page load if enabled
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { try { highlightRandomWords(); applyPaint(); } catch (e) {} });
  else { try { highlightRandomWords(); applyPaint(); } catch (e) {} }

  // apply ASAP (before paint when possible)
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);

  // Keep every open page in sync: when the settings change in another tab/page,
  // reload them from storage and re-apply here too.
  window.addEventListener('storage', e => {
    if (e.key === LS_KEY) { state = load(); apply(); syncUI(); }
  });

  /* ---------------- Panel UI ---------------- */
  let panel, openState = false, ui = {};

  const MODE_CSS = `
  .vp-mode{appearance:none;-webkit-appearance:none;border:0;background:none;padding:2px 8px;cursor:pointer;
    flex:0 0 auto;display:inline-flex;align-items:center;color:var(--ink);transition:opacity .2s;}
  .vp-mode:hover{opacity:.6;}
  .vp-mode .sw{width:52px;height:26px;display:block;}
  .vp-mode .sw-off{display:none;}
  .vp-mode.dark .sw-on{display:none;}
  .vp-mode.dark .sw-off{display:block;}
  .vp-mode.floating{position:fixed;right:8px;top:50%;transform:translateY(-50%);z-index:2147483640;}
  `;

  const CSS = `
  .vptw{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:280px;
    background:#fff;color:#111;border:1.5px solid #111;
    font-family:Arial,Helvetica,sans-serif;display:none;
    box-shadow:10px 10px 0 rgba(17,17,17,.16);}
  .vptw.show{display:block;}
  .vptw__hd{display:flex;align-items:center;justify-content:space-between;
    padding:12px 14px;border-bottom:1.5px solid #111;cursor:move;background:#111;color:#fff;}
  .vptw__hd b{font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;}
  .vptw__x{appearance:none;border:0;background:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;}
  .vptw__x:hover{color:var(--accent,#FF2B00);}
  .vptw__bd{padding:14px;display:flex;flex-direction:column;gap:16px;max-height:72vh;overflow:auto;}
  .vptw__sec{font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#999;}
  .vptw__grp{font:800 13px/1 Arial;letter-spacing:.16em;text-transform:uppercase;color:#111;
    border-bottom:2px solid #111;padding-bottom:7px;margin-top:6px;}
  .vptw__row{display:flex;flex-direction:column;gap:7px;}
  .vptw__seg{display:flex;border:1.5px solid #111;}
  .vptw__seg button{flex:1;appearance:none;border:0;border-right:1.5px solid #111;background:#fff;color:#111;
    font:700 12px/1 Arial;letter-spacing:.02em;padding:9px 4px;cursor:pointer;text-transform:uppercase;}
  .vptw__seg button:last-child{border-right:0;}
  .vptw__seg button.on{background:#111;color:#fff;}
  .vptw__sw{display:flex;gap:8px;}
  .vptw__sw button{width:34px;height:34px;border:1.5px solid #111;cursor:pointer;padding:0;position:relative;}
  .vptw__sw button.on::after{content:"";position:absolute;inset:3px;border:2px solid #fff;mix-blend-mode:difference;}
  .vptw__acc{display:flex;flex-direction:column;gap:9px;margin-top:10px;}
  .vptw__accrow{display:flex;align-items:center;justify-content:space-between;gap:10px;}
  .vptw__acclbl{font:700 10px/1.2 Arial;letter-spacing:.1em;text-transform:uppercase;color:#999;}
  .vptw__acc input[type=color]{width:42px;height:26px;border:1.5px solid #111;padding:0;background:none;cursor:pointer;}
  .vptw__grad{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
  .vptw__gcell{position:relative;display:flex;}
  .vptw__gcell input[type=color]{width:34px;height:30px;}
  .vptw__gcell{cursor:grab;align-items:center;gap:2px;border:1px solid transparent;}
  .vptw__gcell.drag{opacity:.45;}
  .vptw__gcell.over{border-color:#111;}
  .vptw__ggrip{font:10px/1 Arial;color:#999;cursor:grab;user-select:none;padding-right:1px;}
  .vptw__gx{position:absolute;top:-7px;right:-7px;width:15px;height:15px;border:1px solid #111;background:#fff;color:#111;font:700 10px/1 Arial;cursor:pointer;padding:0;border-radius:50%;}
  .vptw__gadd{width:30px;height:30px;border:1.5px dashed #111;background:#fff;color:#111;font:700 16px/1 Arial;cursor:pointer;padding:0;}
  .vptw__grow2{display:flex;gap:6px;}
  .vptw__gbtn{flex:1;border:1.5px solid #111;background:#111;color:#fff;font:700 10px/1 Arial;letter-spacing:.06em;text-transform:uppercase;padding:9px 6px;cursor:pointer;}
  .vptw__gbtn.ghost{background:#fff;color:#111;}
  .vptw__rng{display:flex;align-items:center;gap:10px;}
  .vptw__rng input{flex:1;accent-color:var(--accent,#FF2B00);}
  .vptw__rng span{font:700 12px Arial;min-width:42px;text-align:right;font-variant-numeric:tabular-nums;}
  .vptw__lbl{font:700 12px Arial;letter-spacing:.01em;}
  .vptw__fonts{display:flex;flex-direction:column;gap:6px;}
  .vptw__fonts button{appearance:none;border:1.5px solid #111;background:#fff;color:#111;
    padding:8px 11px;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:3px;}
  .vptw__fonts button.on{background:#111;color:#fff;}
  .vptw__fonts .fn-name{font-size:19px;line-height:1.05;}
  .vptw__fonts .fn-sub{font:400 9.5px/1 Arial;letter-spacing:.1em;text-transform:uppercase;opacity:.55;}
  `;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function build() {
    const style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    panel = el('div', 'vptw');

    const hd = el('div', 'vptw__hd');
    hd.appendChild(el('b', null, 'Tweaks'));
    const x = el('button', 'vptw__x', '✕');
    x.title = 'Schliessen';
    x.onclick = dismiss; hd.appendChild(x);
    panel.appendChild(hd);

    const bd = el('div', 'vptw__bd');

    // Mode
    bd.appendChild(el('div', 'vptw__sec', 'Farbmodus'));
    ui.mode = seg(['Hell', 'Dunkel'], state.mode, v => set('mode', v));
    bd.appendChild(ui.mode.node);

    // Accent
    bd.appendChild(el('div', 'vptw__sec', 'Akzentfarbe'));
    const sw = el('div', 'vptw__sw');
    ui.accentBtns = [];
    ACCENTS.forEach(a => {
      const b = el('button'); b.style.background = a.val; b.title = a.label;
      b.onclick = () => set('accent', a.val);
      if (a.val === state.accent) b.classList.add('on');
      sw.appendChild(b); ui.accentBtns.push({ b, val: a.val });
    });
    bd.appendChild(sw);

    const ax = el('div', 'vptw__acc');
    // custom solid
    const solidRow = el('label', 'vptw__accrow');
    solidRow.appendChild(el('span', 'vptw__acclbl', 'Eigene Farbe'));
    const solidInp = el('input'); solidInp.type = 'color';
    solidInp.value = (/^#[0-9a-f]{6}$/i.test(state.accent) ? state.accent : '#2A2D31');
    solidInp.oninput = () => { state.accentGradient = ''; set('accent', solidInp.value); };
    solidRow.appendChild(solidInp);
    ax.appendChild(solidRow);
    // gradient builder
    ax.appendChild(el('div', 'vptw__acclbl', 'Verlauf (mehrere Farben)'));
    const grow = el('div', 'vptw__grad');
    ui.gradInputs = [];
    function rebuildGradInputs() {
      grow.innerHTML = '';
      ui.gradInputs = [];
      (state.gradColors || []).forEach((c, i) => {
        const wrap = el('div', 'vptw__gcell');
        wrap.draggable = true;
        wrap.dataset.idx = i;
        const ci = el('input'); ci.type = 'color'; ci.value = c;
        ci.oninput = () => { state.gradColors[i] = ci.value; if (state.accentGradient) applyGradient(); };
        ci.draggable = false;
        const grip = el('span', 'vptw__ggrip', '⠿'); grip.title = 'Ziehen zum Sortieren';
        wrap.appendChild(grip);
        wrap.appendChild(ci);
        if (state.gradColors.length > 2) {
          const rm = el('button', 'vptw__gx', '×'); rm.title = 'Entfernen';
          rm.onclick = () => { state.gradColors.splice(i, 1); rebuildGradInputs(); if (state.accentGradient) applyGradient(); };
          wrap.appendChild(rm);
        }
        wrap.addEventListener('dragstart', e => { wrap.classList.add('drag'); e.dataTransfer.setData('text/plain', i); e.dataTransfer.effectAllowed = 'move'; });
        wrap.addEventListener('dragend', () => wrap.classList.remove('drag'));
        wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('over'); });
        wrap.addEventListener('dragleave', () => wrap.classList.remove('over'));
        wrap.addEventListener('drop', e => {
          e.preventDefault(); wrap.classList.remove('over');
          const from = +e.dataTransfer.getData('text/plain'), to = i;
          if (from === to || isNaN(from)) return;
          const arr = state.gradColors;
          const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
          save(); rebuildGradInputs(); if (state.accentGradient) applyGradient();
        });
        grow.appendChild(wrap); ui.gradInputs.push(ci);
      });
      if (state.gradColors.length < 6) {
        const add = el('button', 'vptw__gadd', '+'); add.title = 'Farbe hinzufügen';
        add.onclick = () => { state.gradColors.push('#888888'); rebuildGradInputs(); if (state.accentGradient) applyGradient(); };
        grow.appendChild(add);
      }
    }
    function applyGradient() {
      const cols = (state.gradColors || []).join(', ');
      set('accentGradient', 'linear-gradient(90deg, ' + cols + ')');
    }
    rebuildGradInputs();
    ax.appendChild(grow);
    const gbtns = el('div', 'vptw__grow2');
    const applyBtn = el('button', 'vptw__gbtn', 'Verlauf anwenden');
    applyBtn.onclick = applyGradient;
    const clrBtn = el('button', 'vptw__gbtn ghost', 'Zurücksetzen');
    clrBtn.onclick = () => { set('accentGradient', ''); };
    gbtns.appendChild(applyBtn); gbtns.appendChild(clrBtn);
    ax.appendChild(gbtns);
    const rndBtn = el('button', 'vptw__gbtn rnd', '⚄ Zufall');
    rndBtn.onclick = randomizeAccent;
    ax.appendChild(rndBtn);
    const brushBtn = el('button', 'vptw__gbtn brush', '🖌 Pinsel: aus');
    brushBtn.onclick = () => setBrush(!brushOn, brushBtn);
    ui.brushBtn = brushBtn;
    ax.appendChild(brushBtn);

    // Brush apply controls — shown only when the brush is on
    const hint = el('div', 'vptw__brushhint', 'Text markieren (Wort oder Buchstaben), dann einfärben:');
    hint.style.display = 'none';
    ui.brushHint = hint;
    ax.appendChild(hint);
    const applyRow = el('div', 'vptw__grow2');
    applyRow.style.display = 'none';
    const bColor = el('button', 'vptw__gbtn', 'Farbe');
    bColor.onclick = () => applySelection('solid');
    const bGrad = el('button', 'vptw__gbtn ghost', 'Verlauf');
    bGrad.onclick = () => applySelection('grad');
    applyRow.appendChild(bColor); applyRow.appendChild(bGrad);
    ui.brushApply = applyRow;
    ax.appendChild(applyRow);

    bd.appendChild(ax);
    ui.solidInp = solidInp;

    // ============ TITEL ============
    bd.appendChild(el('div', 'vptw__grp', 'Titel'));
    bd.appendChild(el('div', 'vptw__sec', 'Schriftart'));
    ui.fontHead = fontPicker(state.fontHead, v => set('fontHead', v));
    bd.appendChild(ui.fontHead.node);

    bd.appendChild(el('div', 'vptw__sec', 'Stärke'));
    ui.weightHead = rngCtl(100, 900, 50, state.weightHead, '', v => set('weightHead', v));
    bd.appendChild(ui.weightHead.node);

    bd.appendChild(el('div', 'vptw__sec', 'Laufweite'));
    ui.tracking = trackCtl(state.tracking, v => set('tracking', v));
    bd.appendChild(ui.tracking.node);

    bd.appendChild(el('div', 'vptw__sec', 'Farbe'));
    const hc = colorCtl(['#2A2D31', '#111111', '#1A33E0', '#C0392B'], state.colorHead, v => set('colorHead', v));
    ui.headColorBtns = hc.btns; ui.headColorInp = hc.inp;
    bd.appendChild(hc.node);

    // ============ BODY ============
    bd.appendChild(el('div', 'vptw__grp', 'Body'));
    bd.appendChild(el('div', 'vptw__sec', 'Schriftart'));
    ui.fontBody = fontPicker(state.fontBody, v => set('fontBody', v));
    bd.appendChild(ui.fontBody.node);

    bd.appendChild(el('div', 'vptw__sec', 'Stärke'));
    ui.weightBody = rngCtl(100, 800, 50, state.weightBody, '', v => set('weightBody', v));
    bd.appendChild(ui.weightBody.node);

    bd.appendChild(el('div', 'vptw__sec', 'Laufweite'));
    ui.trackBody = trackCtl(state.trackBody, v => set('trackBody', v));
    bd.appendChild(ui.trackBody.node);

    bd.appendChild(el('div', 'vptw__sec', 'Farbe'));
    const bc = colorCtl(['#2A2D31', '#111111', '#4B4F55', '#3A2E28'], state.textColor, v => set('textColor', v));
    ui.textBtns = bc.btns; ui.textInp = bc.inp;
    bd.appendChild(bc.node);

    // Hero
    bd.appendChild(el('div', 'vptw__sec', 'Hero'));
    ui.hero = seg(['Buchstaben', 'Statisch'], state.hero, v => set('hero', v));
    bd.appendChild(ui.hero.node);

    // Fallende Buchstaben — Schreibweise
    bd.appendChild(el('div', 'vptw__sec', 'Hero-Buchstaben'));
    ui.letterCase = seg(['Versalien', 'Normal'], state.letterCase || 'Versalien', v => set('letterCase', v));
    bd.appendChild(ui.letterCase.node);

    // Logo-Schreibweise (pro Wort)
    bd.appendChild(el('div', 'vptw__sec', 'Logo — Vincent'));
    ui.logoCaseV = seg(['Versalien', 'Normal'], state.logoCaseV || 'Versalien', v => set('logoCaseV', v));
    bd.appendChild(ui.logoCaseV.node);
    bd.appendChild(el('div', 'vptw__sec', 'Logo — Partner'));
    ui.logoCaseP = seg(['Versalien', 'Normal'], state.logoCaseP || 'Versalien', v => set('logoCaseP', v));
    bd.appendChild(ui.logoCaseP.node);

    panel.appendChild(bd);
    document.body.appendChild(panel);
    makeDraggable(panel, hd);
  }

  function seg(options, current, onChange) {
    const node = el('div', 'vptw__seg');
    const btns = [];
    options.forEach(o => {
      const b = el('button', null, o);
      if (o === current) b.classList.add('on');
      b.onclick = () => onChange(o);
      node.appendChild(b); btns.push({ b, val: o });
    });
    return { node, btns };
  }

  function fontPicker(current, onChange) {
    const node = el('div', 'vptw__fonts');
    const btns = [];
    Object.keys(FONTS).forEach(name => {
      const b = el('button'); b.type = 'button';
      const nm = el('span', 'fn-name', name); nm.style.fontFamily = FONTS[name].head;
      const sub = el('span', 'fn-sub', FONTS[name].sub || '');
      b.appendChild(nm); b.appendChild(sub);
      if (name === current) b.classList.add('on');
      b.onclick = () => onChange(name);
      node.appendChild(b); btns.push({ b, val: name });
    });
    return { node, btns };
  }

  function rngCtl(min, max, step, value, unit, onChange) {
    const node = el('div', 'vptw__rng');
    const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    const val = el('span', null, value + unit);
    inp.oninput = () => { val.textContent = inp.value + unit; onChange(+inp.value); };
    node.appendChild(inp); node.appendChild(val);
    return { node, inp, val };
  }

  // Letter-spacing (Laufweite) control, shared by Titel + Body.
  function trackCtl(value, onChange) {
    const node = el('div', 'vptw__rng');
    const inp = el('input'); inp.type = 'range'; inp.min = '-0.12'; inp.max = '0.06'; inp.step = '0.005';
    inp.value = (value != null ? value : 0);
    const val = el('span', null, (+inp.value).toFixed(3) + 'em');
    inp.oninput = () => { val.textContent = (+inp.value).toFixed(3) + 'em'; onChange(+inp.value); };
    node.appendChild(inp); node.appendChild(val);
    return { node, inp, val };
  }

  // Colour control: preset swatches + custom picker + Auto reset.
  // current === '' means "Auto" (follow the mode). onChange('') resets.
  function colorCtl(presets, current, onChange) {
    const node = el('div');
    const sw = el('div', 'vptw__sw');
    const btns = [];
    presets.forEach(c => {
      const b = el('button'); b.style.background = c; b.title = c;
      b.onclick = () => onChange(c);
      sw.appendChild(b); btns.push({ b, val: c });
    });
    node.appendChild(sw);
    const row = el('div', 'vptw__accrow'); row.style.marginTop = '8px';
    const lbl = el('label', 'vptw__acclbl', 'Eigene Farbe'); lbl.style.flex = '1';
    const inp = el('input'); inp.type = 'color';
    inp.value = (/^#[0-9a-f]{6}$/i.test(current) ? current : (presets[0] || '#2A2D31'));
    inp.oninput = () => onChange(inp.value);
    const clr = el('button', 'vptw__gbtn ghost', 'Auto');
    clr.title = 'Folgt dem Farbmodus'; clr.style.padding = '6px 12px'; clr.style.flex = 'none';
    clr.onclick = () => onChange('');
    row.appendChild(lbl); row.appendChild(inp); row.appendChild(clr);
    node.appendChild(row);
    return { node, btns, inp };
  }

  function syncUI() {
    if (!panel) return;
    const segs = [['mode', ui.mode], ['fontHead', ui.fontHead], ['fontBody', ui.fontBody], ['hero', ui.hero], ['letterCase', ui.letterCase], ['logoCaseV', ui.logoCaseV], ['logoCaseP', ui.logoCaseP]];
    segs.forEach(([key, s]) => s && s.btns.forEach(({ b, val }) => b.classList.toggle('on', val === state[key])));
    if (ui.accentBtns) ui.accentBtns.forEach(({ b, val }) => b.classList.toggle('on', val === state.accent));
    if (ui.textBtns) ui.textBtns.forEach(({ b, val }) => b.classList.toggle('on', val === state.textColor));
    if (ui.textInp && /^#[0-9a-f]{6}$/i.test(state.textColor)) ui.textInp.value = state.textColor;
    if (ui.headColorBtns) ui.headColorBtns.forEach(({ b, val }) => b.classList.toggle('on', val === state.colorHead));
    if (ui.headColorInp && /^#[0-9a-f]{6}$/i.test(state.colorHead)) ui.headColorInp.value = state.colorHead;
    if (ui.tracking) { ui.tracking.inp.value = state.tracking; ui.tracking.val.textContent = (+state.tracking).toFixed(3) + 'em'; }
    if (ui.trackBody) { ui.trackBody.inp.value = state.trackBody; ui.trackBody.val.textContent = (+state.trackBody).toFixed(3) + 'em'; }
    if (ui.weightHead) { ui.weightHead.inp.value = state.weightHead; ui.weightHead.val.textContent = '' + state.weightHead; }
    if (ui.weightBody) { ui.weightBody.inp.value = state.weightBody; ui.weightBody.val.textContent = '' + state.weightBody; }
  }

  function makeDraggable(box, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener('mousedown', e => {
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      box.style.right = 'auto'; box.style.bottom = 'auto'; box.style.left = ox + 'px'; box.style.top = oy + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => { if (!drag) return; box.style.left = (ox + e.clientX - sx) + 'px'; box.style.top = (oy + e.clientY - sy) + 'px'; });
    window.addEventListener('mouseup', () => drag = false);
  }

  function show() { if (!panel) build(); openState = true; panel.classList.add('show'); syncUI(); }
  function hide() { openState = false; if (panel) panel.classList.remove('show'); }
  function dismiss() { hide(); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }

  window.addEventListener('message', e => {
    const t = e && e.data && e.data.type;
    if (t === '__activate_edit_mode') show();
    else if (t === '__deactivate_edit_mode') hide();
  });
  window.parent.postMessage({ type: '__edit_mode_available' }, '*');

  function mountModeToggle() {
    if (document.getElementById('vp-mode')) return;
    const st = document.createElement('style'); st.id = 'vp-mode-style'; st.textContent = MODE_CSS; document.head.appendChild(st);
    const t = document.createElement('button');
    t.id = 'vp-mode'; t.className = 'vp-mode' + (state.mode === 'Dunkel' ? ' dark' : '');
    t.type = 'button'; t.setAttribute('aria-label', 'Hell / Dunkel umschalten'); t.title = 'Hell / Dunkel';
    t.innerHTML = '<svg class="sw sw-on" viewBox="0 0 56 28" fill="none"><rect x="1.5" y="1.5" width="53" height="25" rx="12.5" stroke="currentColor" stroke-opacity=".4" stroke-width="1.6"/><circle cx="16" cy="14" r="3.4" fill="currentColor"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="16" y1="6.2" x2="16" y2="8"/><line x1="16" y1="20" x2="16" y2="21.8"/><line x1="8.2" y1="14" x2="10" y2="14"/><line x1="22" y1="14" x2="23.8" y2="14"/><line x1="10.5" y1="8.5" x2="11.8" y2="9.8"/><line x1="20.2" y1="18.2" x2="21.5" y2="19.5"/><line x1="21.5" y1="8.5" x2="20.2" y2="9.8"/><line x1="11.8" y1="18.2" x2="10.5" y2="19.5"/></g><path d="M44 8.6 a5.4 5.4 0 1 0 0 10.8 a4.2 4.2 0 0 1 0 -10.8 z" fill="currentColor" fill-opacity=".28"/></svg><svg class="sw sw-off" viewBox="0 0 56 28" fill="none"><rect x="1.5" y="1.5" width="53" height="25" rx="12.5" stroke="currentColor" stroke-opacity=".4" stroke-width="1.6"/><circle cx="16" cy="14" r="3.4" fill="currentColor" fill-opacity=".6"/><g stroke="currentColor" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"><line x1="16" y1="6.2" x2="16" y2="8"/><line x1="16" y1="20" x2="16" y2="21.8"/><line x1="8.2" y1="14" x2="10" y2="14"/><line x1="22" y1="14" x2="23.8" y2="14"/><line x1="10.5" y1="8.5" x2="11.8" y2="9.8"/><line x1="20.2" y1="18.2" x2="21.5" y2="19.5"/><line x1="21.5" y1="8.5" x2="20.2" y2="9.8"/><line x1="11.8" y1="18.2" x2="10.5" y2="19.5"/></g><path d="M44 8.6 a5.4 5.4 0 1 0 0 10.8 a4.2 4.2 0 0 1 0 -10.8 z" fill="currentColor"/></svg>';
    t.addEventListener('click', () => set('mode', state.mode === 'Dunkel' ? 'Hell' : 'Dunkel'));
    modeToggle = t;
    const nav = document.querySelector('.nav-inner');
    if (nav) { const cta = nav.querySelector('.nav-cta'); const burger = nav.querySelector('.nav-burger'); nav.insertBefore(t, cta || burger || null); }
    else { t.classList.add('floating'); document.body.appendChild(t); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountModeToggle);
  else mountModeToggle();

  window.VPTweaks = { get: () => Object.assign({}, state), set, apply };
})();
