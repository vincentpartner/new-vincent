// palette.js — Farbfelder eines Designsystems automatisch aus einem Bild-Slot
// ableiten. <div class="swatches" data-palette="id" data-from="slot-id"> mit
// N Kindern .sw (Label in <b>). Farben werden aus dem Bild des Slots (oder
// dessen src) gequantisiert; im Editor: Klick auf ein Feld → Hex eingeben
// (überschreibt), Doppelklick → zurück auf Auto. Speichert {id:{i:hex}}
// in .palette.state.json.
(() => {
  const STATE_FILE = '.palette.state.json';
  let state = {}, saving = false, dirty = false;
  const editable = () => !!(window.omelette && window.omelette.writeFile);
  function save() {
    if (!editable()) return;
    if (saving) { dirty = true; return; }
    saving = true;
    Promise.resolve(window.omelette.writeFile(STATE_FILE, JSON.stringify(state)))
      .catch(() => {}).then(() => { saving = false; if (dirty) { dirty = false; save(); } });
  }
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const sat = (c) => { const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

  // Quantize to a 4-bit-per-channel histogram, then pick: lightest (Hintergrund),
  // darkest (Text), most saturated (Akzent), most frequent mid-tone (Primär),
  // most frequent light neutral (Fläche). Count n = number of swatches.
  function extract(img, n) {
    const c = document.createElement('canvas'); const w = 96, h = Math.max(1, Math.round(96 * img.naturalHeight / img.naturalWidth));
    c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data, hist = new Map();
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); hist.set(k, (hist.get(k) || 0) + 1); }
    const cols = [...hist.entries()].map(([k, cnt]) => ({ c: hex(((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17), cnt })).sort((a, b) => b.cnt - a.cnt);
    if (!cols.length) return [];
    const byCount = cols.slice(0, 40);
    const bg = byCount.slice().sort((a, b) => lum(b.c) - lum(a.c))[0].c;
    let text = byCount.slice().sort((a, b) => lum(a.c) - lum(b.c))[0].c;
    if (lum(bg) - lum(text) < 0.35) text = cols.slice().sort((a, b) => lum(a.c) - lum(b.c))[0].c;
    const accent = cols.filter((x) => x.cnt > 2 && lum(x.c) > 0.12 && lum(x.c) < 0.85).sort((a, b) => sat(b.c) * Math.log(b.cnt + 1) - sat(a.c) * Math.log(a.cnt + 1))[0];
    const used = new Set([bg, text, accent && accent.c]);
    const dist = (a, b) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255)); };
    const far = (c) => [...used].every((u) => u && dist(c, u) > 60);
    const primary = byCount.find((x) => lum(x.c) > 0.15 && lum(x.c) < 0.7 && far(x.c));
    if (primary) used.add(primary.c);
    const surface = byCount.find((x) => lum(x.c) > 0.75 && far(x.c));
    const out = [primary && primary.c, accent && accent.c, surface && surface.c, text, bg].map((v) => v || null);
    while (out.length < n) out.push(null);
    for (const x of byCount) { const gap = out.findIndex((v) => !v); if (gap < 0) break; if (!out.includes(x.c) && far(x.c)) { out[gap] = x.c; used.add(x.c); } }
    for (const x of cols) { const gap = out.findIndex((v) => !v); if (gap < 0) break; if (!out.includes(x.c)) out[gap] = x.c; }
    return out.slice(0, n);
  }

  function paint(host, colors) {
    const ov = state[host.dataset.palette] || {};
    host.querySelectorAll('.sw').forEach((sw, i) => {
      const c = ov[i] || colors[i]; if (!c) return;
      sw.querySelector('i').style.background = c;
      const span = sw.querySelector('span'); if (span) span.textContent = c;
      sw.toggleAttribute('data-manual', !!ov[i]);
    });
  }

  function findImage(slot) {
    if (!slot) return null;
    const sr = slot.shadowRoot; const im = sr && sr.querySelector('img');
    if (im && im.currentSrc) return im;
    const src = slot.getAttribute('src'); if (!src) return null;
    const i = new Image(); i.src = src; return i;
  }

  function run(host) {
    const slot = document.getElementById(host.dataset.from);
    const n = host.querySelectorAll('.sw').length;
    const go = () => {
      const img = findImage(slot); if (!img) return;
      const doIt = () => { try { paint(host, extract(img, n)); } catch (e) { /* tainted canvas etc. */ } };
      if (img.complete && img.naturalWidth) doIt(); else img.addEventListener('load', doIt, { once: true });
    };
    go();
    // re-run when the slot swaps its image
    if (slot) { const mo = new MutationObserver(() => setTimeout(go, 60)); mo.observe(slot, { attributes: true, attributeFilter: ['data-filled', 'src'] }); if (slot.shadowRoot) mo.observe(slot.shadowRoot, { subtree: true, attributes: true, attributeFilter: ['src'] }); }
    if (!editable()) return;
    host.querySelectorAll('.sw').forEach((sw, i) => {
      sw.style.cursor = 'pointer'; sw.title = 'Klick: Hex eingeben · Doppelklick: automatisch';
      let t;
      sw.addEventListener('click', () => { clearTimeout(t); t = setTimeout(() => {
        const cur = sw.querySelector('span').textContent;
        const v = prompt('Farbe für «' + sw.querySelector('b').textContent + '» (Hex):', cur); if (v === null) return;
        const m = v.trim().match(/^#?([0-9a-f]{6})$/i); if (!m) return;
        (state[host.dataset.palette] ||= {})[i] = '#' + m[1].toUpperCase(); save(); go();
      }, 250); });
      sw.addEventListener('dblclick', () => { clearTimeout(t); if (state[host.dataset.palette]) { delete state[host.dataset.palette][i]; save(); } go(); });
    });
  }

  function init() {
    fetch(STATE_FILE).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      if (j && typeof j === 'object') state = j;
      const s = document.createElement('style'); s.textContent = '.sw[data-manual] span::after{content:" · manuell"}'; document.head.appendChild(s);
      document.querySelectorAll('[data-palette]').forEach(run);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
