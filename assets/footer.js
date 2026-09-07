/* Shared site footer — inject once, update everywhere.
   Each page just needs <footer class="footer" data-site-footer></footer>.
   Edit THIS file (or the .ft-* rules in aura.css) to update the footer on
   every page at once. */
(function () {
  var HTML =
    '<div class="wrap">' +
      '<div class="ft-grid">' +
        '<div><div class="lets-talk">Let\'s<br>talk</div></div>' +
        '<div class="ft-col">' +
          '<h4>Leistungen</h4>' +
          '<a href="Webdesign.html">Webdesign</a>' +
          '<a href="Onlineshops.html">Onlineshops</a>' +
          '<a href="SEA.html">Onlinemarketing</a>' +
          '<a href="SEO.html">SEO &amp; GEO</a>' +
          '<a href="KI-Automation.html">KI &amp; Automation</a>' +
          '<a href="Leistungen.html">Alle Leistungen</a>' +
        '</div>' +
        '<div class="ft-col">' +
          '<h4>Aktuell</h4>' +
          '<a href="Aktuell.html">Übersicht</a>' +
          '<a href="About.html">Über uns</a>' +
          '<a href="Referenzen.html">Kunden</a>' +
          '<a href="Aktuell.html">Technik</a>' +
          '<a href="SEO.html">SEO</a>' +
        '</div>' +
        '<div class="ft-col">' +
          '<h4>Kontakt</h4>' +
          '<p>Vincent &amp; Partner GmbH</p>' +
          '<p>Räffelstrasse 24<br>CH-8045 Zürich</p>' +
          '<a href="tel:+41445346560">044 534 65 60</a>' +
          '<a href="mailto:info@vincent-partner.ch">info@vincent-partner.ch</a>' +
        '</div>' +
      '</div>' +
      '<div class="ft-bottom">' +
        '<span>© <span data-year></span> Vincent &amp; Partner GmbH · Digitalagentur Zürich</span>' +
        '<span class="legal"><a href="Impressum.html">Impressum</a><a href="AGB.html">AGB</a><a href="Datenschutz.html">Datenschutz</a></span>' +
      '</div>' +
    '</div>';

  function mount() {
    var f = document.querySelector('footer.footer[data-site-footer]') || document.querySelector('footer.footer');
    if (!f) return;
    f.className = 'footer';
    f.innerHTML = HTML;
    var y = new Date().getFullYear();
    f.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = y; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();