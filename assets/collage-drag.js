// collage-drag.js — Bilder in Collagen (.histcol) im Editor frei verschieben.
// Nur Desktop (> 1100 px): Bild ziehen = verschieben (ab 4 px Bewegung, sonst
// normaler Klick → Bild ersetzen). Alt + Klick = Position zurücksetzen.
// Speichert {id:{x,y}} in % der Collagenbreite in .collage-about.state.json.
(() => {
  const STATE_FILE = '.collage-' + (document.body.dataset.page || location.pathname.split('/').pop().replace(/\.html$/i, '').toLowerCase() || 'index') + '.state.json';
  const MIN_W = 1101;
  const isDesk = () => window.innerWidth >= MIN_W;
  const editable = () => !!(window.omelette && window.omelette.writeFile);
  let state = {}, saving = false, dirty = false;
  const imgs = () => Array.from(document.querySelectorAll('.histcol img'));

  function ids() {
    document.querySelectorAll('.histcol').forEach((col, i) => {
      col.querySelectorAll('img').forEach((img, j) => { if (!img.dataset.cd) img.dataset.cd = 'c' + i + '-' + j; });
    });
  }
  function apply(img) {
    const v = state[img.dataset.cd];
    if (!v || !isDesk()) { img.style.removeProperty('translate'); return; }
    const w = img.closest('.histcol').getBoundingClientRect().width || 1;
    img.style.translate = (v.x * w / 100).toFixed(1) + 'px ' + (v.y * w / 100).toFixed(1) + 'px';
  }
  const applyAll = () => imgs().forEach(apply);
  function save() {
    if (saving) { dirty = true; return; }
    saving = true;
    Promise.resolve(window.omelette.writeFile(STATE_FILE, JSON.stringify(state)))
      .catch(() => {}).then(() => { saving = false; if (dirty) { dirty = false; save(); } });
  }
  function eatClick() {
    const f = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener('click', f, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', f, true), 300);
  }

  function attach(img) {
    if (img.__cd) return; img.__cd = true;
    img.draggable = false;
    img.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !isDesk()) return;
      if (e.altKey) { e.preventDefault(); delete state[img.dataset.cd]; apply(img); save(); eatClick(); return; }
      const col = img.closest('.histcol');
      const w = col.getBoundingClientRect().width || 1;
      const v0 = state[img.dataset.cd] || { x: 0, y: 0 };
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false;
      img.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved) { moved = true; img.classList.add('cd-drag'); }
        state[img.dataset.cd] = { x: Math.round((v0.x + dx / w * 100) * 10) / 10, y: Math.round((v0.y + dy / w * 100) * 10) / 10 };
        apply(img);
      };
      const up = () => {
        img.removeEventListener('pointermove', move); img.removeEventListener('pointerup', up); img.removeEventListener('pointercancel', up);
        if (moved) { img.classList.remove('cd-drag'); eatClick(); save(); }
      };
      img.addEventListener('pointermove', move); img.addEventListener('pointerup', up); img.addEventListener('pointercancel', up);
    });
  }

  function init() {
    ids();
    fetch(STATE_FILE).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      if (j && typeof j === 'object') state = j;
      applyAll();
      window.addEventListener('resize', applyAll);
      if (!editable()) return;
      const s = document.createElement('style');
      s.textContent = '@media (min-width:' + MIN_W + 'px){.histcol img{cursor:move;touch-action:none}.histcol img.cd-drag{outline:2px solid #c96442;outline-offset:-2px;z-index:9;position:relative}}';
      document.head.appendChild(s);
      imgs().forEach(attach);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
