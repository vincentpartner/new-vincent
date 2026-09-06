// frame-resize.js — Rahmen (Bildcontainer) im Editor per Drag in Grösse und
// Seitenverhältnis anpassen. Aktivierung: <figure class="shot" data-frame="id">.
// Griff unten rechts: horizontal = Breite (% der Zelle), vertikal = Höhe →
// Seitenverhältnis. Alt/Shift halten = nur Höhe. Doppelklick auf Griff = Reset.
// Speichert {id:{w,ar,m:{w,ar}}} in .frames.state.json — `m` gilt nur bis 820px Breite.
(() => {
  const STATE_FILE = '.frames.state.json';
  // Zwei getrennte Werte pro Rahmen: Desktop und Mobile (<=820px). Was im
  // schmalen Viewport gezogen wird, landet unter `m` und lässt Desktop unberührt.
  const MOBILE_MAX = 820;
  const isMobile = () => window.innerWidth <= MOBILE_MAX;
  let state = {}, saving = false, dirty = false;
  const editable = () => !!(window.omelette && window.omelette.writeFile);

  function apply(el) {
    const rec = state[el.dataset.frame];
    const v = rec && (isMobile() ? (rec.m || null) : rec);
    el.style.removeProperty('aspect-ratio'); el.style.removeProperty('width');
    if (!v) return;
    if (v.ar) el.style.aspectRatio = String(v.ar);
    if (v.w) el.style.width = v.w + '%';
  }
  function applyAll() { document.querySelectorAll('[data-frame]').forEach(apply); }
  function save() {
    if (saving) { dirty = true; return; }
    saving = true;
    Promise.resolve(window.omelette.writeFile(STATE_FILE, JSON.stringify(state)))
      .catch(() => {}).then(() => { saving = false; if (dirty) { dirty = false; save(); } });
  }

  const CSS = '.fr-handle{position:absolute;right:6px;bottom:6px;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #c96442;cursor:nwse-resize;z-index:20;opacity:0;transition:opacity .15s;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
    '[data-frame]:hover>.fr-handle,[data-frame][data-fr-drag]>.fr-handle{opacity:1}' +
    '[data-frame][data-fr-drag]{outline:2px solid #c96442;outline-offset:-2px}' +
    '.fr-badge{position:absolute;left:8px;bottom:8px;z-index:20;font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;background:rgba(0,0,0,.72);color:#fff;padding:5px 7px;border-radius:5px;pointer-events:none;display:none}' +
    '[data-frame][data-fr-drag]>.fr-badge{display:block}';

  function attach(el) {
    if (el.__fr) return; el.__fr = true;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const h = document.createElement('div'); h.className = 'fr-handle'; h.title = 'Ziehen: Grösse & Verhältnis · Doppelklick: zurücksetzen';
    const b = document.createElement('div'); b.className = 'fr-badge';
    el.appendChild(h); el.appendChild(b);
    h.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rec = state[el.dataset.frame];
      if (isMobile()) { if (rec) delete rec.m; } else if (rec) { const m = rec.m; state[el.dataset.frame] = m ? { m } : undefined; if (!m) delete state[el.dataset.frame]; }
      apply(el); save();
    });
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const r0 = el.getBoundingClientRect();
      // Reference width = the frame's natural (unconstrained) width in its cell.
      const prevW = el.style.width; el.style.width = '';
      const cellW = el.getBoundingClientRect().width || r0.width;
      el.style.width = prevW;
      const x0 = e.clientX, y0 = e.clientY;
      el.setAttribute('data-fr-drag', '');
      h.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const onlyH = ev.altKey || ev.shiftKey;
        const w = onlyH ? r0.width : Math.max(120, r0.width + (ev.clientX - x0));
        const hh = Math.max(80, r0.height + (ev.clientY - y0));
        const ar = Math.round((w / hh) * 1000) / 1000;
        const wp = Math.round(Math.min(100, w / cellW * 100) * 10) / 10;
        const id = el.dataset.frame;
        const rec = state[id] || (state[id] = {});
        const tgt = isMobile() ? (rec.m || (rec.m = {})) : rec;
        tgt.ar = ar; if (!onlyH) tgt.w = wp;
        apply(el);
        b.textContent = (isMobile() ? 'Mobile · ' : '') + Math.round(w) + ' × ' + Math.round(hh) + ' · ' + ar.toFixed(2) + ':1';
      };
      const up = () => {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        el.removeAttribute('data-fr-drag'); save();
      };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
  }

  function init() {
    fetch(STATE_FILE).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      if (j && typeof j === 'object') state = j;
      applyAll();
      window.addEventListener('resize', applyAll);
      if (!editable()) return;
      const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
      document.querySelectorAll('[data-frame]').forEach(attach);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
