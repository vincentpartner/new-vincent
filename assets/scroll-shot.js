// <scroll-shot> — borderless, auto-scrolling full-page screenshot (or video).
//
// A fixed-height viewport that holds a tall full-page screenshot. The image
// scrolls slowly on its own (ping-pong, top↔bottom) and the mouse wheel
// scrubs / accelerates it. No browser chrome, no frame — the page styles the
// soft drop shadow. Accepts an image OR a video, and the media can be swapped
// by dropping a file on it (persists via .scroll-shots.state.json inside the
// editor; on a plain host it just uses the src attribute).
//
// Attributes:
//   src          image or video path (required). Video inferred from
//                .mp4/.webm/.mov/.m4v extension, or force with type="video".
//   type         "image" | "video" (optional override)
//   poster       poster image for a video
//   speed        base auto-scroll speed in px/sec (default 26)
//   id           persistence key so a dropped replacement survives reload
//
// Size comes from ordinary CSS on the element (set a width and a height).
(() => {
  const STATE_FILE = '.scroll-shots.state.json';
  const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
  const MAX_VIDEO_BYTES = 12 * 1024 * 1024; // larger clips → supply as a file
  const ENC_MAX_W = 1500; // re-encode dropped images to this width

  // ── shared sidecar (mirrors image-slot's read-fetch / write-omelette) ──
  const subs = new Set();
  let store = {};
  let loaded = false, loadP = null;
  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j === 'object') store = Object.assign(j, store); })
      .catch(() => {})
      .then(() => { loaded = true; subs.forEach((fn) => fn()); });
    return loadP;
  }
  let saving = false, dirty = false;
  function save() {
    if (saving) { dirty = true; return; }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    Promise.resolve(w(STATE_FILE, JSON.stringify(store)))
      .catch(() => {})
      .then(() => { saving = false; if (dirty) { dirty = false; save(); } });
  }
  function setStore(id, val) {
    if (!id) return;
    if (val) store[id] = val; else delete store[id];
    subs.forEach((fn) => fn());
    if (loaded) save(); else load().then(save);
  }

  async function fileToImageDataUrl(file) {
    const bmp = await createImageBitmap(file);
    try {
      const scale = Math.min(1, ENC_MAX_W / bmp.width);
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return c.toDataURL('image/webp', 0.82);
    } finally { bmp.close && bmp.close(); }
  }
  const fileToDataUrl = (file) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });

  const CSS =
    ':host{display:block;position:relative;overflow:hidden;background:rgba(0,0,0,.03);' +
    '  border-radius:var(--shot-radius,0px);cursor:ns-resize;-webkit-user-select:none;user-select:none}' +
    ':host([data-empty]){cursor:default}' +
    '.track{position:absolute;left:0;top:0;width:100%;will-change:transform}' +
    '.track>img,.track>video{display:block;width:100%;height:auto;-webkit-user-drag:none}' +
    '.grad{position:absolute;left:0;right:0;height:64px;pointer-events:none;z-index:2;opacity:.0;transition:opacity .3s}' +
    ':host(:hover) .grad{opacity:1}' +
    '.grad.t{top:0;background:linear-gradient(rgba(0,0,0,.16),transparent)}' +
    '.grad.b{bottom:0;background:linear-gradient(transparent,rgba(0,0,0,.16))}' +
    // progress hairline
    '.bar{position:absolute;right:0;top:0;width:2px;height:100%;z-index:3;background:rgba(0,0,0,.06)}' +
    '.bar i{position:absolute;left:0;top:0;width:100%;background:rgba(0,0,0,.32);height:0}' +
    // editable affordances (only inside the editor)
    '.drop{position:absolute;inset:0;z-index:4;display:none;align-items:center;justify-content:center;' +
    '  text-align:center;background:rgba(201,100,66,.10);color:#7a2f17;font:600 13px/1.4 system-ui,sans-serif}' +
    ':host([data-over]) .drop{display:flex}' +
    '.ctl{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:5;display:none;gap:6px}' +
    ':host([data-editable]:hover) .ctl{display:flex}' +
    '.ctl button{appearance:none;border:0;border-radius:6px;padding:6px 11px;cursor:pointer;' +
    '  background:rgba(15,16,18,.74);color:#fff;font:11px/1 system-ui,sans-serif;backdrop-filter:blur(6px)}' +
    '.ctl button:hover{background:rgba(15,16,18,.9)}' +
    '.empty{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;' +
    '  gap:8px;color:rgba(0,0,0,.5);font:13px/1.4 system-ui,sans-serif;text-align:center;padding:18px}' +
    ':host([data-empty]) .empty{display:flex}' +
    ':host([data-empty]) .track{display:none}' +
    '.toast{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:6;display:none;' +
    '  background:rgba(15,16,18,.86);color:#fff;font:12px/1.3 system-ui,sans-serif;padding:7px 12px;' +
    '  border-radius:7px;max-width:84%;text-align:center}';

  class ScrollShot extends HTMLElement {
    static get observedAttributes() { return ['src', 'type', 'poster', 'speed', 'id']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' + CSS + '</style>' +
        '<div class="track"></div>' +
        '<div class="grad t"></div><div class="grad b"></div>' +
        '<div class="bar"><i></i></div>' +
        '<div class="empty">Kein Bild verknüpft<br><span style="opacity:.7">Screenshot oder Video hierhin ziehen</span></div>' +
        '<div class="drop">Loslassen zum Ersetzen</div>' +
        '<div class="ctl"><button data-a="replace">Ersetzen</button><button data-a="reset">Original</button></div>' +
        '<div class="toast"></div>' +
        '<input type="file" accept="image/*,video/*" hidden>';
      this._track = root.querySelector('.track');
      this._barI = root.querySelector('.bar i');
      this._toast = root.querySelector('.toast');
      this._input = root.querySelector('input');
      this._media = null;
      this._pos = 0; this._dir = 1; this._vel = 0;
      this._max = 0; this._last = 0; this._raf = 0;
      this._visible = true;
      this._sub = () => this._render();
      this._tick = this._tick.bind(this);

      this.addEventListener('wheel', (e) => {
        if (this._max <= 1) return;
        const down = e.deltaY > 0;
        // let the page scroll through once the shot is parked at an edge
        if ((down && this._pos >= this._max - 0.5) || (!down && this._pos <= 0.5)) return;
        e.preventDefault();
        this._vel += e.deltaY * 7;
        this._vel = Math.max(-6000, Math.min(6000, this._vel));
        if (!this._raf) this._start();
      }, { passive: false });

      root.querySelector('.ctl').addEventListener('click', (e) => {
        const a = e.target.getAttribute && e.target.getAttribute('data-a');
        if (a === 'replace') this._input.click();
        else if (a === 'reset') { setStore(this.id || '', null); }
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
      ['dragenter', 'dragover'].forEach((t) => this.addEventListener(t, (e) => {
        if (!this._editable()) return;
        e.preventDefault(); this.setAttribute('data-over', '');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }));
      this.addEventListener('dragleave', (e) => {
        if (!this.contains(e.relatedTarget)) this.removeAttribute('data-over');
      });
      this.addEventListener('drop', (e) => {
        if (!this._editable()) return;
        e.preventDefault(); this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      });
    }

    connectedCallback() {
      subs.add(this._sub);
      load();
      this._io = new IntersectionObserver((ents) => {
        this._visible = ents[0].isIntersecting;
        if (this._visible) this._start(); else this._stop();
      }, { threshold: 0 });
      this._io.observe(this);
      this._onVis = () => { if (document.hidden) this._stop(); else if (this._visible) this._start(); };
      document.addEventListener('visibilitychange', this._onVis);
      this._render();
    }
    disconnectedCallback() {
      subs.delete(this._sub);
      this._stop();
      if (this._io) this._io.disconnect();
      document.removeEventListener('visibilitychange', this._onVis);
    }
    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    _editable() { return !!(window.omelette && window.omelette.writeFile); }
    _showToast(msg) {
      this._toast.textContent = msg; this._toast.style.display = 'block';
      clearTimeout(this._tt); this._tt = setTimeout(() => { this._toast.style.display = 'none'; }, 3200);
    }

    async _ingest(file) {
      try {
        if (/^video\//.test(file.type)) {
          if (file.size > MAX_VIDEO_BYTES) {
            // too heavy to embed — preview this session only
            const url = URL.createObjectURL(file);
            this._mount({ u: url, t: 'video' }, true);
            this._showToast('Video zu gross zum Speichern — als Datei liefern, ich verknüpfe es dauerhaft.');
            return;
          }
          const u = await fileToDataUrl(file);
          setStore(this.id || '', { u, t: 'video' });
        } else if (/^image\//.test(file.type)) {
          const u = await fileToImageDataUrl(file);
          setStore(this.id || '', { u, t: 'image' });
        } else {
          this._showToast('Bitte ein Bild oder Video.');
        }
      } catch (err) { this._showToast('Datei konnte nicht gelesen werden.'); }
    }

    _render() {
      this.toggleAttribute('data-editable', this._editable());
      const stored = this.id ? store[this.id] : null;
      const srcAttr = this.getAttribute('src') || '';
      const u = (stored && stored.u) || srcAttr;
      let t = (stored && stored.t) ||
        (this.getAttribute('type') || (VIDEO_RE.test(u) ? 'video' : 'image'));
      if (!u) { this.setAttribute('data-empty', ''); this._track.innerHTML = ''; this._media = null; return; }
      this.removeAttribute('data-empty');
      this._mount({ u, t }, false);
    }

    _mount(media, transient) {
      const { u, t } = media;
      const key = t + '|' + u;
      if (this._mediaKey === key) return;
      this._mediaKey = key;
      this._track.innerHTML = '';
      this._pos = 0; this._dir = 1; this._vel = 0; this._max = 0;
      this._track.style.transform = 'translateY(0)';
      let el;
      if (t === 'video') {
        el = document.createElement('video');
        el.src = u; el.muted = true; el.loop = true; el.autoplay = true;
        el.playsInline = true; el.setAttribute('playsinline', '');
        const p = this.getAttribute('poster'); if (p) el.poster = p;
        el.addEventListener('loadedmetadata', () => this._measure());
        el.play && el.play().catch(() => {});
      } else {
        el = document.createElement('img');
        el.decoding = 'async'; el.alt = '';
        el.addEventListener('load', () => this._measure());
        el.src = u;
      }
      this._media = el;
      this._track.appendChild(el);
      this._measure();
    }

    _measure() {
      const vh = this.clientHeight || 0;
      const mh = this._track.scrollHeight || 0;
      this._max = Math.max(0, mh - vh);
      if (this._pos > this._max) this._pos = this._max;
      this._updateBar();
      if (this._visible) this._start();
    }

    _start() {
      if (this._raf || !this._visible) return;
      this._last = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }
    _stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }

    _tick(now) {
      this._raf = 0;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      if (this._max > 1) {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const base = reduce ? 0 : (parseFloat(this.getAttribute('speed')) || 26);
        this._pos += (this._dir * base + this._vel) * dt;
        this._vel *= Math.exp(-dt / 0.28); // momentum bleeds off in ~0.3s
        if (Math.abs(this._vel) < 2) this._vel = 0;
        if (this._pos >= this._max) { this._pos = this._max; this._dir = -1; }
        else if (this._pos <= 0) { this._pos = 0; this._dir = 1; }
        this._track.style.transform = 'translateY(' + (-this._pos) + 'px)';
        this._updateBar();
      }
      // keep ticking while visible (auto-scroll) — cheap transform only
      if (this._visible && !document.hidden) this._raf = requestAnimationFrame(this._tick);
    }

    _updateBar() {
      const f = this._max > 0 ? this._pos / this._max : 0;
      this._barI.style.height = Math.max(4, f * (this.clientHeight || 0)) + 'px';
    }
  }

  if (!customElements.get('scroll-shot')) customElements.define('scroll-shot', ScrollShot);
})();
