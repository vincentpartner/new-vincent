/* Reference slider — swipeable horizontal track with prev/next buttons.
   Supports multiple independent sliders on one page. Each slider is a
   `.refslider` containing a `[data-rs-track]` and optional
   `[data-rs-prev]` / `[data-rs-next]` buttons. */
(function(){
  function initSlider(root){
    var track = root.querySelector('[data-rs-track]');
    if(!track) return;
    var prev = root.querySelector('[data-rs-prev]');
    var next = root.querySelector('[data-rs-next]');

    function step(){
      var card = track.querySelector('.refc');
      var gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    }
    function maxScroll(){ return track.scrollWidth - track.clientWidth; }
    function update(){
      if(prev) prev.disabled = track.scrollLeft <= 2;
      if(next) next.disabled = track.scrollLeft >= maxScroll() - 2;
    }
    // Manual timer-based smooth scroll (rAF/native smooth can be paused in embeds)
    var anim = null;
    function stopAnim(){ if(anim){ clearInterval(anim); anim = null; } }
    function smoothTo(target){
      target = Math.max(0, Math.min(maxScroll(), target));
      stopAnim();
      var startPos = track.scrollLeft, dist = target - startPos, t0 = Date.now(), dur = 420;
      anim = setInterval(function(){
        var p = Math.min(1, (Date.now() - t0) / dur);
        var e = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2; // easeInOutQuad
        track.scrollLeft = startPos + dist * e;
        update();
        if(p >= 1) stopAnim();
      }, 16);
    }
    if(prev) prev.addEventListener('click', function(){ smoothTo(track.scrollLeft - step()); });
    if(next) next.addEventListener('click', function(){ smoothTo(track.scrollLeft + step()); });
    track.addEventListener('scroll', update, {passive:true});
    window.addEventListener('resize', update);
    update();

    // Drag / swipe with pointer
    var down=false, startX=0, startScroll=0, moved=0;
    track.addEventListener('pointerdown', function(e){
      if(e.pointerType==='mouse' && e.button!==0) return;
      stopAnim();
      down=true; moved=0; startX=e.clientX; startScroll=track.scrollLeft;
      track.classList.add('dragging');
    });
    track.addEventListener('pointermove', function(e){
      if(!down) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      track.scrollLeft = startScroll - dx;
    });
    function end(){
      if(!down) return;
      down=false;
      track.classList.remove('dragging');
      update();
    }
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('pointerleave', end);
    // Suppress click after a real drag
    track.addEventListener('click', function(e){
      if(moved > 6){ e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  // Track mit data-rs-source="Referenzen.html" data-rs-group="Webseiten": Kacheln
  // werden zur Laufzeit aus der genannten Gruppe auf Referenzen.html übernommen
  // (gleiche Reihenfolge, neuste zuerst). Statischer Inhalt = Fallback ohne fetch.
  // Bild + Zuschnitt kommen per data-mirror aus dem Sidecar von Referenzen.html
  // (image-slot.js), die Kacheln sind hier nicht editierbar.
  function syncFromSource(track){
    var src = track.getAttribute('data-rs-source'), group = track.getAttribute('data-rs-group');
    if(!src || !window.fetch || location.protocol === 'file:') return Promise.resolve();
    var mirrorName = src.replace(/\.html?$/i,'').toLowerCase().replace(/[^a-z0-9_-]/g,'_');
    return fetch(src, {cache:'no-cache'}).then(function(x){ return x.ok ? x.text() : null; }).catch(function(){ return null; }).then(function(html){
      if(!html) return;
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var heads = doc.querySelectorAll('.refgroup-head'), grid = null;
      for(var i=0;i<heads.length;i++){
        if(!group || (heads[i].textContent||'').indexOf(group) !== -1){ grid = heads[i].nextElementSibling; break; }
      }
      if(!grid) grid = doc.querySelector('.refs');
      if(!grid) return;
      var cards = grid.querySelectorAll('.refc');
      if(!cards.length) return;
      var frag = document.createDocumentFragment();
      for(var j=0;j<cards.length;j++){
        var c = document.importNode(cards[j], true);
        var is = c.querySelector('image-slot');
        if(is && is.id) is.setAttribute('data-mirror', mirrorName);
        frag.appendChild(c);
      }
      track.innerHTML = '';
      track.appendChild(frag);
    });
  }

  function initAll(){
    var sliders = document.querySelectorAll('.refslider');
    for(var i=0;i<sliders.length;i++){
      (function(root){
        var track = root.querySelector('[data-rs-track]');
        var p = track ? syncFromSource(track) : Promise.resolve();
        p.then(function(){ initSlider(root); });
      })(sliders[i]);
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
