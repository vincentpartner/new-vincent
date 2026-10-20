/* askbot.js — Fragen & Antworten mit dem trainierten Chatbase-Bot (via /chat/chat.php, same-origin).
   Markup: <section class="ask" data-ask data-page="Webdesign"><script type="application/json" class="ask-tips-config">["Frage", …]</script></section>
   Antworten werden gestreamt und in grosser Schrift gesetzt. */
(function () {
  const hosts = document.querySelectorAll('[data-ask]');
  if (!hosts.length) return;
  // Backend liegt auf Hostpoint (nicht bei Cyon, wo die Seiten liegen): absolute Adresse.
  // Überschreibbar per data-endpoint am Abschnitt (chat/test.html nutzt 'chat.php' same-origin).
  const BACKEND = 'https://api.vincent-partner.ch/chat/chat/chat.php';
  const endpointFor = h => h.dataset.endpoint || BACKEND;

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Minimal-Markdown → HTML (Absätze, Listen, fett, Links)
  function md(t) {
    t = t.replace(/\[[^\]]*\]\(https?:\/\/(?:www\.)?calendly\.com[^\s)]*\)/gi, '[Termin / Rückruf](Kontakt.html)')
      .replace(/<?https?:\/\/(?:www\.)?calendly\.com\/[^\s>)]*>?/gi, '[Termin / Rückruf](Kontakt.html)')
      .replace(/\[[^\]]*\]\((?:https?:\/\/)?(?:www\.)?vincent-partner\.ch\/lets-talk[^\s)]*\)/gi, '[Termin / Rückruf](Kontakt.html)')
      .replace(/<?(?:https?:\/\/)?(?:www\.)?vincent-partner\.ch\/lets-talk[\w\-\/]*>?/gi, '[Termin / Rückruf](Kontakt.html)');
    const lines = t.replace(/\r/g, '').split('\n'); let out = '', list = null;
    const inl = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|[\w\-]+\.html[^\s)]*)\)/g, (m, a, h) => `<a href="${h}"${/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : ''}>${a}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)([.,;:!?]?)(?=\s|$|\))/g, (m, p, h, e) => `${p}<a href="${h}" target="_blank" rel="noopener">${h.replace(/^https?:\/\/(www\.)?/, '')}</a>${e}`);
    const close = () => { if (list) { out += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { close(); continue; }
      let m;
      if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inl(m[1])}</li>`; }
      else { close(); out += `<p>${inl(l.replace(/^#+\s*/, ''))}</p>`; }
    }
    close(); return out;
  }

  hosts.forEach(host => {
    const page = host.dataset.page || document.title.split('—')[0].trim();
    let tips = [];
    try { tips = JSON.parse(host.querySelector('.ask-tips-config')?.textContent || '[]'); } catch (e) {}
    const history = [];
    let n = 0, busy = false, session = 0, ctrl = null;

    host.insertAdjacentHTML('beforeend', `
      <div class="ask-head">
        <div><div class="mono">Preise, Ablauf und Möglichkeiten · ${esc(page)}</div><h2 class="ptitle" style="font-size:clamp(30px,4.4vw,60px)">Fragen kostet nichts.</h2><p class="mono ask-try">Jetzt den Chat testen.</p></div>
        <span class="mono ask-live"><svg class="ask-orb" data-orb></svg>Antwortet sofort</span>
      </div>
      <div class="ask-tips" data-tips aria-label="Beispielfragen"></div>
      <form class="ask-form" data-form>
        <div class="ask-field"><textarea rows="1" placeholder="Ihre Frage zu ${esc(page)} …" aria-label="Ihre Frage" data-input></textarea><span class="ask-caret" aria-hidden="true"></span></div>
        <button class="ask-send" type="submit" aria-label="Frage senden" data-send><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7l7 7l-7 7"/></svg></button>
      </form>
      <p class="ask-privacy">Ihre Frage wird zur Beantwortung an unseren Chat-Dienstleister Chatbase übermittelt. Bitte keine vertraulichen Angaben. Mehr in der <a href="Datenschutz.html">Datenschutzerklärung</a>.</p>
      <div class="ask-thread" data-thread aria-live="polite"></div>
      <div class="ask-foot"><span>Preise sind Richtwerte. Verbindlich wird es im <a href="Kontakt.html">Gespräch</a>.</span><button type="button" class="ask-reset" data-reset hidden>Neu beginnen</button></div>`);

    const tipsEl = host.querySelector('[data-tips]'), form = host.querySelector('[data-form]'), input = host.querySelector('[data-input]'),
          send = host.querySelector('[data-send]'), orbEl = host.querySelector('[data-orb]'), thread = host.querySelector('[data-thread]'), reset = host.querySelector('[data-reset]');

    if (orbEl && window.ThinkingOrb) window.ThinkingOrb.mountOrb(orbEl, { size: 20 }); else if (orbEl) orbEl.remove();

    // Rotierende Beispielfragen: 3 sichtbar, alle 6 s wechselt eine
    let order = tips.map((_, i) => i).sort(() => Math.random() - .5), ptr = 0, slot = 0, timer;
    const next = () => tips[order[ptr++ % order.length]];
    function renderTips() {
      if (!tips.length) { tipsEl.remove(); return; }
      const show = Math.min(3, tips.length);
      tipsEl.innerHTML = '';
      for (let i = 0; i < show; i++) tipsEl.appendChild(mkTip(next(), i));
      if (tips.length > show && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(rotate, 6000);
    }
    function mkTip(q, i) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ask-tip';
      b.innerHTML = `<span class="k">Zum Beispiel</span><span>${esc(q)}</span>`;
      b.addEventListener('click', () => ask(q));
      return b;
    }
    function rotate() {
      const btns = tipsEl.querySelectorAll('.ask-tip'); if (!btns.length) return;
      const old = btns[slot % btns.length]; slot++;
      old.classList.add('out');
      setTimeout(() => { const nb = mkTip(next()); nb.classList.add('out'); old.replaceWith(nb); requestAnimationFrame(() => requestAnimationFrame(() => nb.classList.remove('out'))); }, 380);
    }
    tipsEl.addEventListener('mouseenter', () => clearInterval(timer));
    tipsEl.addEventListener('mouseleave', () => { clearInterval(timer); if (tips.length > 3) timer = setInterval(rotate, 6000); });
    renderTips();

    const grow = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', e => { e.preventDefault(); const q = input.value.trim(); if (q) ask(q); });
    reset.addEventListener('click', () => {
      session++; if (ctrl) { ctrl.abort(); ctrl = null; }
      history.length = 0; thread.innerHTML = ''; n = 0; reset.hidden = true; busy = false; send.disabled = false; input.focus();
    });

    async function ask(q) {
      if (busy) return; busy = true; send.disabled = true; reset.hidden = false;
      const sid = session; ctrl = new AbortController(); const sig = ctrl.signal;
      input.value = ''; grow();
      n++;
      const turn = document.createElement('div'); turn.className = 'ask-turn';
      turn.innerHTML = `<div class="ask-q"><span class="k">Frage ${String(n).padStart(2, '0')}</span>${esc(q)}</div><div class="ask-a think streaming">Einen Moment</div>`;
      thread.appendChild(turn);
      const a = turn.querySelector('.ask-a');
      const top = turn.getBoundingClientRect().top + window.scrollY - 120;
      if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top, behavior: 'smooth' });
      history.push({ role: 'user', content: q });
      let text = '';
      try {
        const r = await fetch(endpointFor(host), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(), page }), signal: sig });
        if (!r.ok) throw new Error((await r.text()) || ('HTTP ' + r.status));
        a.classList.remove('think');
        const rd = r.body.getReader(), dec = new TextDecoder();
        while (true) { const { value, done } = await rd.read(); if (done) break; if (sid !== session) { rd.cancel().catch(() => {}); return; } text += dec.decode(value, { stream: true }); a.innerHTML = md(text); }
        if (sid !== session) return;
        text = text.trim();
        if (!text) throw new Error('Leere Antwort.');
        a.innerHTML = md(text);
        history.push({ role: 'assistant', content: text });
        reset.hidden = false;
      } catch (err) {
        if (sid !== session || err.name === 'AbortError') return;
        a.classList.remove('think'); a.classList.add('err');
        const m = String(err.message || '');
        const net = err instanceof TypeError; // fetch selbst fehlgeschlagen: CORS blockiert, DNS, offline
        console.error('[askbot] Anfrage an', endpointFor(host), 'fehlgeschlagen:', net ? 'Netzwerk/CORS — Domain ' + location.host + ' in chat/config.php allowed_hosts?' : m);
        a.textContent = /konfiguriert/.test(m) ? 'Der Chat ist noch nicht freigeschaltet. Rufen Sie uns an oder buchen Sie einen Termin.' : /warten/.test(m) ? m : /Nicht erlaubt/.test(m) ? 'Diese Domain ist für den Chat nicht freigegeben.' : 'Gerade keine Verbindung. Versuchen Sie es gleich noch einmal oder fragen Sie uns direkt.';
        history.pop();
      } finally {
        if (sid === session) { a.classList.remove('streaming'); busy = false; send.disabled = false; ctrl = null; reset.hidden = !history.length; }
      }
    }
  });
})();
