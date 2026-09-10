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
    const lines = t.replace(/\r/g, '').split('\n'); let out = '', list = null;
    const inl = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|[\w\-]+\.html[^\s)]*)\)/g, (m, a, h) => `<a href="${h}"${/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : ''}>${a}</a>`);
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
    let n = 0, busy = false;

    host.insertAdjacentHTML('beforeend', `
      <div class="ask-head">
        <div><div class="mono">Fragen &amp; Antworten · ${esc(page)}</div><h2 class="ptitle" style="font-size:clamp(30px,4.4vw,60px)">Fragen Sie einfach.</h2></div>
        <span class="mono ask-live">Antwortet sofort</span>
      </div>
      <div class="ask-tips" data-tips aria-label="Beispielfragen"></div>
      <form class="ask-form" data-form>
        <textarea rows="1" placeholder="Ihre Frage zu ${esc(page)} …" aria-label="Ihre Frage" data-input></textarea>
        <button class="ask-send" type="submit" aria-label="Frage senden" data-send><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7l7 7l-7 7"/></svg></button>
      </form>
      <div class="ask-thread" data-thread aria-live="polite"></div>
      <div class="ask-foot"><span>Preise sind Richtwerte. Verbindlich wird es im <a href="Kontakt.html">Gespräch</a>.</span><button type="button" class="ask-reset" data-reset hidden>Neu beginnen</button></div>`);

    const tipsEl = host.querySelector('[data-tips]'), form = host.querySelector('[data-form]'), input = host.querySelector('[data-input]'),
          send = host.querySelector('[data-send]'), thread = host.querySelector('[data-thread]'), reset = host.querySelector('[data-reset]');

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
    reset.addEventListener('click', () => { history.length = 0; thread.innerHTML = ''; n = 0; reset.hidden = true; input.focus(); });

    async function ask(q) {
      if (busy) return; busy = true; send.disabled = true;
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
        const r = await fetch(endpointFor(host), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history, page }) });
        if (!r.ok) throw new Error((await r.text()) || ('HTTP ' + r.status));
        a.classList.remove('think');
        const rd = r.body.getReader(), dec = new TextDecoder();
        while (true) { const { value, done } = await rd.read(); if (done) break; text += dec.decode(value, { stream: true }); a.innerHTML = md(text); }
        text = text.trim();
        if (!text) throw new Error('Leere Antwort.');
        a.innerHTML = md(text);
        history.push({ role: 'assistant', content: text });
        reset.hidden = false;
      } catch (err) {
        a.classList.remove('think'); a.classList.add('err');
        const m = String(err.message || '');
        a.textContent = /konfiguriert/.test(m) ? 'Der Chat ist noch nicht freigeschaltet. Rufen Sie uns an oder buchen Sie einen Termin.' : /warten/.test(m) ? m : 'Gerade keine Verbindung. Versuchen Sie es gleich noch einmal oder fragen Sie uns direkt.';
        history.pop();
      } finally {
        a.classList.remove('streaming'); busy = false; send.disabled = false;
      }
    }
  });
})();
