/* Cost calculator for service pages.
   Markup: <div data-calc><script type="application/json" class="calc-config">{...}</script></div>
   Config: slider (min/max/step/default, unit, base, perUnit) + groups.
   Group types: "choice" (single select, first item = default) and "toggle" (multi).
   Item: {name, price, monthly, on}. Monthly totals render as a second amount.
   Optional: pmPct (Zuschlag auf Einmalkosten), monthlyBase, monthlyPct (Anteil Sliderwert). */
(function () {
  function fmt(n) {
    return Math.round(n).toLocaleString('de-CH').replace(/[,.]/g, "'");
  }
  function init(host) {
    if (host.__calc) return;
    host.__calc = true;
    const cfgEl = host.querySelector('script.calc-config');
    let cfg;
    try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }

    // legacy: flat addons array -> one toggle group
    const groups = cfg.groups || [{ name: 'Leistungen (Add-ons)', type: 'toggle', items: cfg.addons || [] }];
    const state = {
      slider: cfg.default != null ? cfg.default : cfg.min,
      sel: groups.map(g => g.type === 'choice' ? Math.max(0, g.items.findIndex(i => i.on))
        : g.type === 'slider' ? (g.default != null ? g.default : g.min)
        : g.items.map(i => !!i.on))
    };

    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'calc-inner';
    wrap.innerHTML = `
      <div class="calc-left">
        <div class="mono calc-kick">[01] Kalkulator</div>
        <h2 class="ptitle calc-title">${cfg.title || 'Projekt<br>Schätzung.'}</h2>
        <p class="calc-intro">${cfg.intro || 'Konfigurieren Sie Ihr Projekt. Basierend auf unseren Erfahrungswerten erhalten Sie eine unverbindliche Indikation.'}</p>
        <div class="calc-hint"><span class="calc-hint-in" data-hint><span class="calc-hint-num" data-hint-num></span><span data-hint-text></span></span></div>
      </div>
      <div class="calc-right">
        <div class="calc-step mono" data-stepno="01" data-hint-for="${(cfg.sliderHint || '').replace(/"/g, '&quot;')}">01. ${cfg.sliderLabel || 'Umfang & Komplexität'}</div>
        <div class="calc-srow">
          <span class="calc-sval" data-sval></span>
          <span class="calc-smax">${cfg.maxLabel || ''}</span>
        </div>
        <input class="calc-range" type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step || 1}" value="${state.slider}" aria-label="${(cfg.sliderLabel || 'Umfang').replace(/"/g, '&quot;')}">
        <div data-groups></div>
        <div class="calc-step mono calc-gstep">${String(groups.length + 2).padStart(2, '0')}. ${cfg.notesLabel || 'Ihre Notiz (optional)'}</div>
        <textarea class="calc-notes" data-notes rows="3" placeholder="${cfg.notesPlaceholder || 'Was benötigen Sie konkret? Zeitrahmen, bestehende Website, Besonderheiten…'}"></textarea>
        <div class="calc-total">
          <div>
            <div class="mono calc-tlabel">${cfg.totalLabel || 'Geschätzte Investition'}</div>
            <div class="mono calc-tnote">${cfg.discountNote || 'Unverbindliche Indikation (Exkl. MwSt.)'}</div>
          </div>
          <div class="calc-amount"><span class="calc-cur">CHF</span> <span data-total>0</span></div>
        </div>
        <div class="calc-total calc-total-m" data-mwrap hidden>
          <div>
            <div class="mono calc-tlabel">${cfg.monthlyLabel || 'Laufende Betreuung'}</div>
            <div class="mono calc-tnote">${cfg.monthlyNote || 'Pro Monat, monatlich kündbar (Exkl. MwSt.)'}</div>
          </div>
          <div class="calc-amount"><span class="calc-cur">CHF</span> <span data-monthly>0</span><span class="calc-per">/Mt.</span></div>
        </div>
        <a class="calc-cta" href="Kontakt.html" data-cta>Anfrage finalisieren</a>
      </div>`;
    host.appendChild(wrap);

    const range = wrap.querySelector('.calc-range');
    const svalEl = wrap.querySelector('[data-sval]');
    const totalEl = wrap.querySelector('[data-total]');
    const monthlyEl = wrap.querySelector('[data-monthly]');
    const mWrap = wrap.querySelector('[data-mwrap]');
    const gHost = wrap.querySelector('[data-groups]');

    groups.forEach((g, gi) => {
      const head = document.createElement('div');
      head.className = 'calc-step mono calc-gstep';
      head.dataset.stepno = String(gi + 2).padStart(2, '0');
      if (g.hint) head.dataset.hintFor = g.hint;
      head.textContent = String(gi + 2).padStart(2, '0') + '. ' + (g.name || '');
      gHost.appendChild(head);
      if (g.type === 'slider') {
        const box = document.createElement('div');
        box.innerHTML = `<div class="calc-srow"><span class="calc-sval" data-gval></span><span class="calc-smax">${g.maxLabel || ''}</span></div>
          <input class="calc-range" type="range" min="${g.min}" max="${g.max}" step="${g.step || 1}" value="${state.sel[gi]}" aria-label="${(g.name || 'Auswahl').replace(/"/g, '&quot;')}">`;
        gHost.appendChild(box);
        const gr = box.querySelector('input');
        const gv = box.querySelector('[data-gval]');
        g.__val = gv;
        gr.addEventListener('input', () => { state.sel[gi] = +gr.value; recalc(); });
        return;
      }
      const tiles = document.createElement('div');
      tiles.className = 'calc-tiles';
      tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-label', g.name || '');
      gHost.appendChild(tiles);
      g.items.forEach((it, ii) => {
        const on = g.type === 'choice' ? state.sel[gi] === ii : state.sel[gi][ii];
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'calc-tile' + (on ? ' on' : '');
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
        const p = it.monthly ? '+ ' + fmt(it.monthly) + '/Mt.' : it.perPage ? '+ ' + fmt(it.perPage) + ' / Seite' : (it.price ? '+ ' + fmt(it.price) : '—');
        t.innerHTML = `<span class="calc-tname">${it.name}</span><span class="mono calc-tprice">${p}</span>`;
        t.addEventListener('click', () => {
          if (g.type === 'choice') {
            state.sel[gi] = ii;
            [...tiles.children].forEach((el, k) => { el.classList.toggle('on', k === ii); el.setAttribute('aria-pressed', k === ii ? 'true' : 'false'); });
          } else {
            state.sel[gi][ii] = !state.sel[gi][ii];
            t.classList.toggle('on', state.sel[gi][ii]);
            t.setAttribute('aria-pressed', state.sel[gi][ii] ? 'true' : 'false');
          }
          recalc();
        });
        tiles.appendChild(t);
      });
    });

    function unitText(v) {
      if (cfg.steps && cfg.steps[v]) return cfg.steps[v];
      return (cfg.valFmt === 'num' ? fmt(v) : v) + (cfg.unit ? ' ' + cfg.unit : '');
    }
    function recalc() {
      const v = +range.value;
      svalEl.textContent = unitText(v);
      let one = (cfg.base || 0) + (v - cfg.min) * (cfg.perUnit || 0);
      let mon = (cfg.monthlyBase || 0) + v * (cfg.monthlyPct || 0);
      groups.forEach((g, gi) => {
        if (g.type === 'slider') {
          const gv = state.sel[gi];
          if (g.__val) g.__val.textContent = (g.steps && g.steps[gv]) ? g.steps[gv] : 'Stufe ' + gv + ' / ' + g.max;
          one += (g.base || 0) + (gv - g.min) * (g.perUnit || 0);
          return;
        }
        g.items.forEach((it, ii) => {
          const on = g.type === 'choice' ? state.sel[gi] === ii : state.sel[gi][ii];
          if (!on) return;
          one += it.price || 0;
          one += (it.perPage || 0) * v;
          mon += it.monthly || 0;
        });
      });
      if (cfg.pmPct) one *= (1 + cfg.pmPct);
      if (cfg.discount) one *= (1 - cfg.discount);
      totalEl.textContent = fmt(one);
      monthlyEl.textContent = fmt(mon);
      mWrap.hidden = !(mon > 0);
    }
    range.addEventListener('input', recalc);
    recalc();

    // Erklärtext links: erscheint, sobald der Schritt die Bildschirmmitte erreicht
    const hintBox = wrap.querySelector('[data-hint]');
    const hintNum = wrap.querySelector('[data-hint-num]');
    const hintTxt = wrap.querySelector('[data-hint-text]');
    const steps = [...wrap.querySelectorAll('.calc-step[data-hint-for]')].filter(el => el.dataset.hintFor);
    let curHint = null;
    function syncHint() {
      const mid = window.innerHeight * 0.52;
      let active = null;
      steps.forEach(el => { if (el.getBoundingClientRect().top < mid) active = el; });
      if (!active) active = steps[0];
      const key = active ? active.dataset.stepno : null;
      if (key === curHint) return;
      curHint = key;
      hintBox.classList.remove('show');
      if (!active) return;
      setTimeout(() => {
        if (curHint !== key) return;
        hintNum.textContent = active.dataset.stepno;
        hintTxt.textContent = active.dataset.hintFor;
        hintBox.classList.add('show');
      }, 180);
    }
    if (steps.length) {
      hintNum.textContent = steps[0].dataset.stepno;
      hintTxt.textContent = steps[0].dataset.hintFor;
      curHint = steps[0].dataset.stepno;
      hintBox.classList.add('show');
    }
    let raf = 0, lastY = null;
    (function tick() {
      const y = window.scrollY + window.innerHeight;
      if (y !== lastY) { lastY = y; syncHint(); }
      raf = requestAnimationFrame(tick);
    })();
    addEventListener('scroll', syncHint, { passive: true });
    document.addEventListener('scroll', syncHint, { capture: true, passive: true });
    addEventListener('resize', syncHint);

    // Konfiguration ins Kontaktformular übernehmen
    const notesEl = wrap.querySelector('[data-notes]');
    wrap.querySelector('[data-cta]').addEventListener('click', () => {
      const v = +range.value;
      const lines = [(cfg.calcName || document.title.split('—')[0].trim()) + ' — Konfiguration aus dem Preisrechner', ''];
      lines.push((cfg.sliderLabel || 'Umfang') + ': ' + unitText(v));
      groups.forEach((g, gi) => {
        if (g.type === 'slider') {
          const gv = state.sel[gi];
          lines.push(g.name + ': ' + ((g.steps && g.steps[gv]) ? g.steps[gv] : 'Stufe ' + gv + ' / ' + g.max));
          return;
        }
        const picked = g.items.filter((it, ii) => g.type === 'choice' ? state.sel[gi] === ii : state.sel[gi][ii]).map(it => it.name);
        if (picked.length) lines.push(g.name + ': ' + picked.join(', '));
      });
      lines.push('', (cfg.totalLabel || 'Geschätzte Investition') + ': CHF ' + totalEl.textContent + ' (' + (cfg.discountNote || 'einmalig, exkl. MwSt.') + ')');
      if (!mWrap.hidden) lines.push((cfg.monthlyLabel || 'Laufende Kosten') + ': CHF ' + monthlyEl.textContent + ' / Mt. (' + (cfg.monthlyNote || 'pro Monat, exkl. MwSt.') + ')');
      const note = (notesEl.value || '').trim();
      if (note) lines.push('', 'Notiz: ' + note);
      try {
        localStorage.setItem('vp:calc-request', JSON.stringify({ ts: Date.now(), summary: lines.join('\n') }));
      } catch (e) {}
    });
  }
  function boot() { document.querySelectorAll('[data-calc]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
