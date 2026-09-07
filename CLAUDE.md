# Projekt: Vincent & Partner — Website

## Hosting-Setup (WICHTIG — das ist der aktuelle Plan)
Die Website wird **selbst gehostet auf Hostpoint** (nicht mehr auf Tilda).
- **Alles unter einer Domain**: Statische Seiten **und** das PHP-Backend liegen auf
  demselben Hostpoint-Webspace / derselben Domain (z. B. `vincent-partner.ch` und
  `vincent-partner.ch/kalender/`).
- **Same-Origin → kein CORS, keine `api.`-Subdomain nötig.** Das Frontend ruft das
  Backend relativ auf (`/kalender/availability.php`). Der frühere Umweg über
  `api.vincent-partner.ch` + CORS war nur wegen Tilda nötig und entfällt.
- **Deployment = einmal hochladen** (ganze Site + `kalender/`-Ordner per FTP/SFTP auf
  Hostpoint), kein Seite-für-Seite-Einpflegen in einen Tilda-`<head>` mehr.
- PHP ist auf Hostpoint verfügbar → das Kalender-Backend läuft dort direkt.

## Terminbuchung: eigenes Google-Kalender-Backend (NICHT Calendly)
Die Buchung läuft über ein **selbst gehostetes Google-Kalender-Backend** im Ordner
`kalender/` — **nicht** mehr über Calendly.
- `kalender/availability.php` → liefert freie 1,5-h-Slots aus dem Google-Kalender
  (via `freeBusy`), Form: `{ "collection": [ { start_time, status } ] }`.
- `kalender/book.php` → legt den Termin an und lädt beide Seiten ein (inkl.
  Google-Meet-Link).
- `kalender/google.php` / `config.php` / `oauth-setup.php` → OAuth + Config;
  Token/Refresh-Token bleiben **serverseitig geheim** (siehe `.htaccess`).
- Frontend: `Kontakt.html`, `CONFIG.availUrl` = `/kalender/availability.php`,
  `CONFIG.bookUrl` = `/kalender/book.php` (relativ, same-origin). Nie wieder auf eine
  `api.`-Subdomain umstellen.
- `calendly/` wurde entfernt (obsolet).

## Projekt-Regeln (dauerhaft einhalten)
1. **Keine Arbeitsordner im Projekt**: `uploads/`, `scraps/`, `export/`, `mobile/` und
   `.thumbnail` sind gelöscht und werden nicht neu angelegt. Hochgeladenes Material nach
   Gebrauch entfernen. Projekt-Root = deploybare Site.
2. **Keine Vorlagen-Reste**: Aura-Vorlageseiten oder -Assets, die von keiner echten Seite
   verlinkt sind, werden nicht behalten. Neue Assets nur anlegen, wenn eine Seite sie lädt.
3. **Jede HTML-Datei endet mit `</html>`** — nichts danach (insb. keine
   `<style id="__om-edit-overrides">`-Editor-Reste). Vor Abschluss prüfen.
4. **Keine externen Ressourcen**: keine externen Skripte, Fonts oder Bilder
   (kein tildacdn, kein cdnjs, kein Google Fonts). Alles lokal:
   Bilder → `assets/img/`, Fonts → `assets/fonts/` + `assets/fonts.css`,
   Fremd-Skripte → `assets/vendor/` (z. B. `matter.min.js`). Neue externe Bilder sofort
   herunterladen und lokal verweisen. Erlaubt bleiben nur ausgehende Links sowie die
   iframe-Embeds (Google Maps in Kontakt, YouTube-nocookie in About).
5. **Keine SEO-/Meta-Blöcke**: kein `og:`, kein Twitter-Card, kein JSON-LD, keine
   sitemap/robots. SEO wird nachgelagert in einem eigenen Werkzeug gepflegt.
6. **Jede Seite genau ein `<title>`**; keine Verweise auf gelöschte Dateien.
7. Abschluss jeder Aufräum-/Änderungsrunde: melden, was entfernt/geändert wurde.
9. **Vor jedem Export** (dauerhaft): `uploads/`, `scraps/`, `export/`, `mobile/`, `.thumbnail` löschen;
   unverlinkte Seiten und Assets auflisten und entfernen (Ausnahme: die zwei eigenständigen Dokumente);
   nichts nach `</html>`; keine externen Ressourcen; Kontakt-CONFIG relativ auf `/kalender/`;
   Bild-Editier-Funktionen (media-edit, image-slot, frame-resize, scroll-shot) BEHALTEN — sie werden
   erst im Produktions-Build entfernt. Abschlussprüfung: ein `<title>` pro Seite, keine toten Verweise,
   Liste gelöscht/bereinigt/offen melden.
8. **SEO-Struktur (ab jetzt auf jeder Seite)**: genau ein `<h1>` = die Breadcrumb-/Eyebrow-Zeile
   (`.crumbs .here`) über dem grossen Anzeigetitel, formuliert als Suchbegriff (Leistung + Branche + Ort,
   z. B. «Webdesign Praxis Wirbelsäulenmedizin in Zürich»). Der grosse Anzeigetitel ist
   `<p class="ptitle">`/`<p class="display">`, kein Heading. Sektions-Eyebrows sind `<h2 class="mono">`
   mit Keyword, Leistungspunkte `<h3>` suchnah («Webdesign für Arztpraxen» statt «Umsetzung»).
   Lead-Absatz wiederholt den Suchbegriff. Jedes `<img>`/`<image-slot>` hat ein beschreibendes
   `alt` (Motiv + Kunde + Leistung). Referenzen derselben Branche untereinander verlinken,
   Branchenbegriff im Linktext («Nächstes Projekt · Webdesign für …»).

## Offene To-dos
- **Medien-Sidecars materialisieren** (`.image-slots-*.state.json`, `.scroll-shots.state.json`,
  `.media-edits-*.state.json`, `.frames.state.json` → Rahmengrössen als Inline-Style) → echte Dateien unter `assets/img/`, Pfade direkt in die Seiten
  einbacken. Ohne diesen Schritt fehlen die per Editor ersetzten Bilder auf Hostpoint.
  Stand 2026-09-05: image-slot-Bilder bereits als `assets/img/refs/<slot-id>.webp` + `src`-Attribut eingebaut;
  Sidecars sind seither **pro Seite** (`.image-slots-<seite>.state.json`, `.media-edits-<seite>.state.json`; Host erlaubt nur EINEN Punkt vor `.state.json`),
  Host-Limit ~2 MB pro Sidecar. Neue Editor-Uploads periodisch wieder materialisieren (gleiches Skript-Muster).
  Danach direkt Projekt-Root (ohne Sidecars/CLAUDE.md) + `kalender/` hochladen.

## Tech-Notizen
- Gemeinsame Assets: assets/swiss.css (Tokens/Typo/Nav/Footer), assets/aura.css (Komponenten),
  assets/tweaks.js (Tweaks-Panel + Hell/Dunkel-Schalter + Akzent/Verlauf + Pinsel),
  assets/site.js, assets/falling-letters.js (Home-Hero), assets/dotgrid.js (SEO-Hero),
  assets/fluid.js (Webdesign-Swirl), assets/calc.js (Kostenrechner), assets/image-slot.js,
  assets/fonts.css (lokale Webfonts, in jedem <head> vor swiss.css), assets/vendor/matter.min.js,
  assets/frame-resize.js (Editor-Griff an [data-frame]-Rahmen: Grösse/Verhältnis, .frames.state.json).
- Bild/Video ersetzen (alle Seiten): assets/media-edit.js rüstet JEDES inhaltliche
  <img> zum ersetzbaren Medium auf (Bild ODER kurzes lautloses Loop-Video, Upload per
  Klick/Drag, nur im Editor sichtbar). Opt-out: <img ... data-no-edit>. Speichert in
  .media-edits.state.json. <image-slot> (Bilder, .image-slots.state.json) und
  <scroll-shot> (Bild/Video, .scroll-shots.state.json) bringen eigene Ersetzen-Logik mit.
- Deploy: kein separater export/-Ordner mehr. Sidecars in-place materialisieren (siehe To-dos),
  dann Projekt-Root + kalender/ auf Hostpoint hochladen.
- Seiten: index, About, Leistungen, Webdesign, Onlineshops, SEO, SEA, KI, KI-Automation,
  Referenzen, Referenz-* (20 Detailseiten: 12 Webseiten, 4 Onlineshops, 4 Onlinemarketing), Kontakt.
  Alte Tilda-Referenzseiten (allvisa, en111, pkbasf, pkkfmv, eldur, rigaflex, Brawand) sind gelöscht.
- Slider auf Webdesign/Onlineshops/SEA und Focus auf index ziehen Kacheln, Bild und Zuschnitt live aus
  Referenzen.html (refslider.js `data-rs-source/-group`, image-slot `data-mirror="referenzen"`,
  gemeinsamer Sidecar `.image-slots-referenzen.state.json`). Reihenfolge = Referenzen.html, neuste oben.
- kalender/: gehärtet (Header-Encoding, Slot-Validierung, flock-Rate-Limit in kalender/data/,
  HTTPS-only CORS, Webhook-Host-Allowlist, Honeypot + Zeitfeld `t`).
- Eigenständige Dokumente (nicht verlinkt, bewusst behalten): Anleitung-flexpep-freischalten.html
  (+ doc-page.js), Sommerferien-Laufband.html (Laufband-Snippet).
