// assets/media-edit.js
// ─────────────────────────────────────────────────────────────────────────
// Universelle "Bild ersetzen"-Schicht für GANZ normale <img> Elemente.
//
// Rüstet jedes inhaltlich relevante <img> auf der Seite zu einem ersetzbaren
// Medium auf: per Klick/Drag kann der Nutzer ein anderes Bild ODER ein kurzes
// (lautloses, gelooptes) Video hochladen. Die Ersetzung wird im Sidecar
// `.media-edits.state.json` gespeichert und überlebt Reload, Share-Link und
// den Zip-Export.
//
// Lässt <image-slot> und <scroll-shot> bewusst in Ruhe — die bringen ihre
// eigene Ersetzen-Logik mit. Nur im Editor (window.omelette.writeFile)
// erscheinen die Bedien-Affordances; auf einem normalen Host (z.B. Tilda)
// ist alles unsichtbar und das Original-Bild bleibt stehen.
//
// Opt-out je Bild:  <img ... data-no-edit>
// ─────────────────────────────────────────────────────────────────────────
(() => {
  const PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  // Sidecar pro Seite (Host-Limit ~2 MB pro *.state.json). Legacy: eine Datei für alle.
  const STATE_FILE = '.media-edits-' + PAGE.replace(/\.html?$/, '').replace(/[^a-z0-9_-]/g, '_') + '.state.json';
  const LEGACY_FILE = '.media-edits.state.json';
  const ENC_MAX_W = 2400;                 // Bilder auf diese Breite re-encoden (Screenshots scharf halten)
  const MAX_VIDEO_BYTES = 1.3 * 1024 * 1024; // Host-Limit ~2 MB pro Sidecar (Base64 +33 %)
  const MAX_STORE_CHARS = 1.9 * 1024 * 1024;
  const MIN_SIDE = 60;                    // kleinere Bildchen (Icons) ignorieren

  // ── Sidecar (gleiche read-fetch / write-omelette Mechanik wie image-slot) ──
  const subs = new Set();
  let store = {};
  let loaded = false, loadP = null;
  function load() {
    if (loadP) return loadP;
    const get = (f) => fetch(f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loadP = Promise.all([get(STATE_FILE), get(LEGACY_FILE)])
      .then(([own, legacy]) => {
        // Legacy-Einträge dieser Seite übernehmen, eigene Datei gewinnt
        if (legacy && typeof legacy === 'object') Object.keys(legacy).forEach((k) => { if (k.indexOf(PAGE + '#') === 0) store[k] = legacy[k]; });
        if (own && typeof own === 'object') Object.assign(store, own);
      })
      .then(() => { loaded = true; subs.forEach((fn) => fn()); });
    return loadP;
  }
  let saving = false, dirty = false;
  function save() {
    if (saving) { dirty = true; return; }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    const json = JSON.stringify(store);
    if (json.length > MAX_STORE_CHARS) {
      saving = false;
      toast('Speicher dieser Seite voll (max. ~2 MB für ersetzte Medien). Bild/Video per «Original» zurücksetzen oder Datei im Chat hochladen, dann wird sie fest eingebaut.');
      return;
    }
    Promise.resolve(w(STATE_FILE, json))
      .then(() => { if (pendingOk) { toast(pendingOk); pendingOk = ''; } })
      .catch((e) => { toast('Speichern fehlgeschlagen: ' + (e && e.message ? e.message : 'write failed') + '. Datei im Chat hochladen, dann wird sie fest eingebaut.'); console.warn('[media-edit] save failed', e); })
      .then(() => { saving = false; if (dirty) { dirty = false; save(); } });
  }
  let pendingOk = '';
  function setStore(key, val) {
    if (!key) return;
    if (val) store[key] = val; else delete store[key];
    subs.forEach((fn) => fn());
    if (loaded) save(); else load().then(save);
  }

  const editable = () => !!(window.omelette && window.omelette.writeFile);

  // ── Datei -> data URL ──────────────────────────────────────────────────
  async function fileToImageDataUrl(file) {
    const bmp = await createImageBitmap(file);
    try {
      const scale = Math.min(1, ENC_MAX_W / bmp.width);
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return c.toDataURL('image/webp', 0.92);
    } finally { bmp.close && bmp.close(); }
  }
  const fileToDataUrl = (file) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });

  // ── Welche <img> sind "Inhalt" (und damit ersetzbar)? ──────────────────
  function eligible(img) {
    if (!img || img.dataset.mkey) return img && img.dataset.mkey; // schon erfasst
    if (img.hasAttribute('data-no-edit')) return false;
    if (img.closest('image-slot, scroll-shot, .media-edit-ui')) return false;
    const blob = ((img.getAttribute('src') || '') + ' ' + (img.alt || '') + ' ' + img.className).toLowerCase();
    if (/logo|icon|favicon|avatar|sprite/.test(blob)) return false;
    const r = img.getBoundingClientRect();
    // Bei noch nicht geladenen/0-grossen: über natural- bzw. Attribut-Grösse schätzen
    const w = r.width || img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
    const h = r.height || img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
    if (w && h && (w < MIN_SIDE || h < MIN_SIDE)) return false;
    return true;
  }

  // ── Floating-Toolbar (eine, wird über das gehoverte Bild gelegt) ───────
  let bar, fileInput, current = null, hideT = 0;
  function buildUI() {
    if (bar) return;
    const style = document.createElement('style');
    style.textContent =
      '.media-edit-ui{position:fixed;z-index:2147483000;display:none;gap:6px;' +
      '  font:600 11px/1 system-ui,-apple-system,sans-serif}' +
      '.media-edit-ui button{appearance:none;border:0;border-radius:7px;padding:7px 11px;cursor:pointer;' +
      '  background:rgba(15,16,18,.82);color:#fff;backdrop-filter:blur(6px);' +
      '  box-shadow:0 4px 14px rgba(0,0,0,.28)}' +
      '.media-edit-ui button:hover{background:rgba(15,16,18,.95)}' +
      '.media-edit-ui button.rm{background:rgba(150,40,24,.82)}' +
      '.media-edit-ui button.rm:hover{background:rgba(150,40,24,.95)}' +
      'img[data-mkey]{outline-offset:-2px;transition:outline-color .12s}' +
      'html.media-edit-on img[data-mkey]:hover{outline:2px solid rgba(201,100,66,.9);cursor:pointer}' +
      '.media-edit-ghost{outline:2px solid rgba(201,100,66,.9)!important}' +
      '.media-edit-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483001;' +
      '  background:rgba(15,16,18,.9);color:#fff;font:500 13px/1.4 system-ui,sans-serif;padding:10px 16px;' +
      '  border-radius:9px;max-width:80vw;text-align:center;display:none;box-shadow:0 8px 28px rgba(0,0,0,.35)}';
    document.head.appendChild(style);

    bar = document.createElement('div');
    bar.className = 'media-edit-ui';
    bar.innerHTML =
      '<button data-a="replace" title="Bild oder kurzes Video (max. 1,3 MB) hochladen">Ersetzen</button>' +
      '<button data-a="vurl" title="Video per Link (mp4, YouTube, Vimeo)">Video-URL</button>' +
      '<button data-a="reset" class="rm" title="Original wiederherstellen" style="display:none">Original</button>';
    document.body.appendChild(bar);

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);

    bar.addEventListener('mouseenter', () => clearTimeout(hideT));
    bar.addEventListener('mouseleave', scheduleHide);
    bar.addEventListener('click', (e) => {
      const a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (!current) return;
      if (a === 'replace') fileInput.click();
      else if (a === 'vurl') {
        const el = current;
        const u = prompt('Video-Link einfügen (mp4/webm-URL, YouTube- oder Vimeo-Link):', '');
        if (!u) return;
        const emb = toEmbed(u.trim());
        if (!emb) { toast('Link nicht erkannt. Erlaubt: .mp4/.webm-URL, YouTube oder Vimeo.'); return; }
        setStore(el.dataset.mkey, Object.assign({ orig: el.dataset.morig || el.getAttribute('src') || '' }, emb));
      }
      else if (a === 'reset') { setStore(current.dataset.mkey, null); }
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f && current) ingest(current, f);
      fileInput.value = '';
    });
    window.addEventListener('scroll', () => { if (bar.style.display === 'flex' && current) placeBar(current); }, true);
    window.addEventListener('resize', () => { if (bar.style.display === 'flex' && current) placeBar(current); });
  }

  function placeBar(el) {
    const r = el.getBoundingClientRect();
    bar.style.display = 'flex';
    // mittig oben über dem Bild
    const bw = bar.offsetWidth || 150, bh = bar.offsetHeight || 30;
    let left = r.left + r.width / 2 - bw / 2;
    let top = r.top + 10;
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    top = Math.max(8, top);
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }

  function showBar(el) {
    if (!editable()) return;
    clearTimeout(hideT);
    current = el;
    const has = !!store[el.dataset.mkey];
    bar.querySelector('[data-a="reset"]').style.display = has ? '' : 'none';
    placeBar(el);
  }
  function scheduleHide() {
    hideT = setTimeout(() => {
      bar.style.display = 'none';
      if (current) current.classList.remove('media-edit-ghost');
      current = null;
    }, 180);
  }

  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'media-edit-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.style.display = 'none'; }, 4200);
  }

  // Video-Link -> {u, t:'video'} (Direktdatei) oder {u, t:'embed'} (YouTube/Vimeo)
  function toEmbed(u) {
    let m;
    if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/)))
      return { u: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&mute=1&loop=1&playlist=' + m[1] + '&controls=0&rel=0&playsinline=1', t: 'embed' };
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)))
      return { u: 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1&muted=1&loop=1&background=1', t: 'embed' };
    if (/^https?:\/\/.+\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(u)) return { u, t: 'video' };
    return null;
  }

  async function ingest(el, file) {
    const key = el.dataset.mkey;
    try {
      if (/^video\//.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name || '')) {
        if (file.size > MAX_VIDEO_BYTES) {
          toast('Video (' + Math.round(file.size / 1048576) + ' MB) ist zu gross für den Editor-Speicher (max. 1,3 MB). Zwei Wege: Datei im Chat hochladen – sie wird fest in die Seite eingebaut – oder «Video-URL» (mp4-Link, YouTube, Vimeo).');
          return;
        }
        toast('Video wird gespeichert …');
        const u = await fileToDataUrl(file);
        pendingOk = 'Video gespeichert.';
        setStore(key, { u, t: 'video', orig: el.dataset.morig || el.getAttribute('src') || '' });
      } else if (/^image\//.test(file.type)) {
        toast('Bild wird gespeichert …');
        const u = await fileToImageDataUrl(file);
        pendingOk = 'Bild gespeichert.';
        setStore(key, { u, t: 'image', orig: el.dataset.morig || el.getAttribute('src') || '' });
      } else {
        toast('Bitte ein Bild oder ein kurzes Video wählen.');
      }
    } catch (err) {
      toast('Datei konnte nicht gelesen oder gespeichert werden: ' + (err && err.message ? err.message : err));
      console.warn('[media-edit] ingest failed', err);
    }
  }

  // ── Video-Overlay (für ein <img>, das durch ein Video ersetzt wurde) ───
  // Wir behalten das <img> (versteckt) als Layout-Anker und legen ein
  // <video> exakt darüber, das die berechnete Geometrie des Bildes erbt.
  function ensureVideo(el, url, embed) {
    let v = el._mediaVideo;
    const wantTag = embed ? 'IFRAME' : 'VIDEO';
    if (v && v.tagName !== wantTag) { v.remove(); v = el._mediaVideo = null; }
    if (!v) {
      if (embed) {
        v = document.createElement('iframe');
        v.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        v.setAttribute('frameborder', '0');
        v.setAttribute('title', el.alt || 'Video');
      } else {
        v = document.createElement('video');
        v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
        v.setAttribute('playsinline', '');
      }
      v.setAttribute('data-media-video', '');
      el._mediaVideo = v;
      el.insertAdjacentElement('afterend', v);
    }
    // Geometrie vom Bild übernehmen
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const parent = el.offsetParent || el.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      el.dataset.mParentPos = '1';
      parent.style.position = 'relative';
    }
    v.style.cssText =
      'position:absolute;z-index:1;' +
      'border-radius:' + cs.borderRadius + ';' +
      'object-fit:' + (cs.objectFit && cs.objectFit !== 'fill' ? cs.objectFit : 'cover') + ';' +
      'object-position:' + cs.objectPosition + ';';
    // Position relativ zum offsetParent berechnen
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      v.style.left = el.style.left || cs.left;
      v.style.top = el.style.top || cs.top;
      v.style.right = cs.right;
      v.style.bottom = cs.bottom;
      v.style.inset = cs.inset;
      v.style.width = cs.width;
      v.style.height = cs.height;
    } else {
      const pr = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
      v.style.left = (r.left - pr.left) + 'px';
      v.style.top = (r.top - pr.top) + 'px';
      v.style.width = r.width + 'px';
      v.style.height = r.height + 'px';
    }
    if (v.getAttribute('src') !== url) { v.src = url; v.play && v.play().catch(() => {}); }
    el.style.visibility = 'hidden';
    // Video-Overlay fängt Hover ab -> Ersetzen-Leiste auch über dem Video anbieten
    if (!v._wired) {
      v._wired = true;
      v.addEventListener('mouseenter', () => { if (editable()) showBar(el); });
      v.addEventListener('mouseleave', scheduleHide);
      if (!embed) v.addEventListener('click', (e) => { if (!editable()) return; e.preventDefault(); current = el; fileInput.click(); });
    }
    if (embed && editable()) v.style.pointerEvents = 'none';
  }
  function removeVideo(el) {
    if (el._mediaVideo) { el._mediaVideo.remove(); el._mediaVideo = null; }
    el.style.visibility = '';
  }

  // ── Ein einzelnes Bild rendern (Original / ersetzt) ────────────────────
  function renderOne(el) {
    const key = el.dataset.mkey;
    const rec = store[key];
    if (!rec || !rec.u) {
      removeVideo(el);
      const orig = el.dataset.morig;
      if (orig != null && el.getAttribute('src') !== orig) el.setAttribute('src', orig);
      el.removeAttribute('data-mreplaced');
      return;
    }
    el.setAttribute('data-mreplaced', rec.t);
    if (rec.t === 'video' || rec.t === 'embed') {
      ensureVideo(el, rec.u, rec.t === 'embed');
    } else {
      removeVideo(el);
      if (el.getAttribute('src') !== rec.u) el.setAttribute('src', rec.u);
    }
  }

  // ── Bilder einsammeln & verdrahten ─────────────────────────────────────
  // Schlüssel müssen OHNE Browser reproduzierbar sein (für den Zip-Export):
  // entweder `seite#id:<id>` (wenn das <img> eine id hat) oder
  // `seite#n<globaler Bild-Index>` — der Index zählt ALLE <img> in
  // Dokument-Reihenfolge, exakt so wie das Export-Skript sie per Regex zählt.
  function keyFor(img) {
    if (img.id) return PAGE + '#id:' + img.id;
    const all = document.getElementsByTagName('img');
    let gi = -1;
    for (let i = 0; i < all.length; i++) { if (all[i] === img) { gi = i; break; } }
    return PAGE + '#n' + gi;
  }
  function adopt(img) {
    if (img.dataset.mkey || !eligible(img)) return;
    const key = keyFor(img);
    img.dataset.mkey = key;
    img.dataset.morig = img.getAttribute('src') || '';
    img.addEventListener('mouseenter', () => { if (editable()) { img.classList.add('media-edit-ghost'); showBar(img); } });
    img.addEventListener('mouseleave', () => { img.classList.remove('media-edit-ghost'); scheduleHide(); });
    img.addEventListener('click', (e) => {
      if (!editable()) return;
      // Wenn das Bild ein Link-Inhalt ist, Klick zum Hochladen abfangen
      e.preventDefault(); e.stopPropagation();
      current = img; fileInput.click();
    });
    // Drag & Drop direkt aufs Bild
    img.addEventListener('dragover', (e) => { if (editable()) { e.preventDefault(); img.classList.add('media-edit-ghost'); } });
    img.addEventListener('dragleave', () => img.classList.remove('media-edit-ghost'));
    img.addEventListener('drop', (e) => {
      if (!editable()) return;
      e.preventDefault(); e.stopPropagation();
      img.classList.remove('media-edit-ghost');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) ingest(img, f);
    });
    renderOne(img);
  }

  function scan() {
    document.querySelectorAll('img:not([data-mkey])').forEach(adopt);
  }

  function renderAll() {
    document.querySelectorAll('img[data-mkey]').forEach(renderOne);
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  function boot() {
    buildUI();
    document.documentElement.classList.toggle('media-edit-on', editable());
    subs.add(renderAll);
    load();
    scan();
    // Nachzügler (lazy-geladene Bilder, dynamisch eingefügte Galerien)
    const mo = new MutationObserver(() => { scan(); });
    mo.observe(document.body, { childList: true, subtree: true });
    // Geometrie der Video-Overlays bei Resize aktualisieren
    window.addEventListener('resize', () => {
      document.querySelectorAll('img[data-mreplaced="video"],img[data-mreplaced="embed"]').forEach((el) => {
        if (el._mediaVideo) ensureVideo(el, el._mediaVideo.getAttribute('src'), el.getAttribute('data-mreplaced') === 'embed');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Für das Export-Werkzeug / Debug zugänglich machen
  window.MediaEdit = {
    get store() { return store; },
    rescan: scan,
    page: PAGE,
    stateFile: STATE_FILE,
  };
})();
