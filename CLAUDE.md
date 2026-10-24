# Projekt: Vincent & Partner — Website

## Hosting-Setup (Stand 2026-10-24 — so ist es tatsächlich umgesetzt)
Zwei Schweizer Hoster, zwei Domains (nicht mehr Tilda):
- **Website auf Cyon** (`vincent-partner.ch`, Webroot `public_html/`): statische Seiten,
  `assets/`, Sidecars. Upload-Anleitung: `README-Golive.md`.
- **Backends auf Hostpoint** unter `api.vincent-partner.ch`: Kalender (`availability.php`,
  `book.php` direkt in der Wurzel) und Chat (`chat/`). Diese Ordner liegen **nicht** mehr
  in diesem Repo (alte `kalender/`-Kopie wurde ins Archiv verschoben, Commit 9b2df58).
- **Cross-Origin → CORS nötig.** Das Frontend ruft das Backend mit **absoluten URLs** auf;
  erlaubte Origins in `kalender/config.php` → `origins` bzw. `chat/config.php` →
  `allowed_hosts` (+ `chat/.htaccess`): `vincent-partner.ch` und `www.vincent-partner.ch`.

## Terminbuchung: eigenes Google-Kalender-Backend (NICHT Calendly)
Die Buchung läuft über ein **selbst gehostetes Google-Kalender-Backend** auf Hostpoint —
**nicht** über Calendly.
- `availability.php` → liefert freie 1,5-h-Slots aus dem Google-Kalender
  (via `freeBusy`), Form: `{ "collection": [ { start_time, status } ] }`.
- `book.php` → legt den Termin an und lädt beide Seiten ein (inkl. Google-Meet-Link).
- `google.php` / `config.php` / `oauth-setup.php` → OAuth + Config;
  Token/Refresh-Token bleiben **serverseitig geheim** (`.htaccess`). `config.php` nie
  versionieren und beim Update nicht überschreiben.
- Frontend: `Kontakt.html`, `CONFIG.availUrl` = `https://api.vincent-partner.ch/availability.php`,
  `CONFIG.bookUrl` = `https://api.vincent-partner.ch/book.php`.
- Chat «Fragen & Antworten»: `assets/askbot.js` → `BACKEND` auf `api.vincent-partner.ch/chat/…`,
  eingebunden auf KI-Automation, Kontakt, Onlineshops, SEA, SEO, Webdesign.
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
   unverlinkte Seiten und Assets auflisten und entfernen;
   nichts nach `</html>`; keine externen Ressourcen (Ausnahme: eigene Backend-Aufrufe auf
   `api.vincent-partner.ch`); Kontakt-CONFIG und askbot-BACKEND zeigen auf `https://api.vincent-partner.ch/`;
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
  einbacken. Ohne diesen Schritt fehlen die per Editor ersetzten Bilder auf Cyon.
  Stand 2026-09-05: image-slot-Bilder bereits als `assets/img/refs/<slot-id>.webp` + `src`-Attribut eingebaut;
  Sidecars sind seither **pro Seite** (`.image-slots-<seite>.state.json`, `.media-edits-<seite>.state.json`; Host erlaubt nur EINEN Punkt vor `.state.json`),
  Host-Limit ~2 MB pro Sidecar. Neue Editor-Uploads periodisch wieder materialisieren (gleiches Skript-Muster).
  Danach Projekt-Root (ohne Sidecars/CLAUDE.md) auf Cyon hochladen (siehe `README-Golive.md`).

## Tech-Notizen
- Gemeinsame Assets: assets/swiss.css (Tokens/Typo/Nav/Footer), assets/aura.css (Komponenten),
  assets/tweaks.js (Tweaks-Panel + Hell/Dunkel-Schalter + Akzent/Verlauf + Pinsel),
  assets/site.js, assets/falling-letters.js (Home-Hero), assets/dotgrid.js (SEO-Hero),
  assets/fluid.js (Webdesign-Swirl), assets/calc.js (Archiv-Preisrechner, derzeit von keiner Seite geladen), assets/image-slot.js,
  assets/fonts.css (lokale Webfonts, in jedem <head> vor swiss.css), assets/vendor/matter.min.js,
  assets/frame-resize.js (Editor-Griff an [data-frame]-Rahmen: Grösse/Verhältnis, .frames.state.json).
- Bild/Video ersetzen (alle Seiten): assets/media-edit.js rüstet JEDES inhaltliche
  <img> zum ersetzbaren Medium auf (Bild ODER kurzes lautloses Loop-Video, Upload per
  Klick/Drag, nur im Editor sichtbar). Opt-out: <img ... data-no-edit>. Speichert in
  .media-edits.state.json. <image-slot> (Bilder, .image-slots.state.json) und
  <scroll-shot> (Bild/Video, .scroll-shots.state.json) bringen eigene Ersetzen-Logik mit.
- Deploy: kein separater export/-Ordner mehr. Sidecars in-place materialisieren (siehe To-dos),
  dann Projekt-Root auf Cyon hochladen; Backend-Änderungen separat auf Hostpoint
  (`api.vincent-partner.ch`), Configs dort nicht überschreiben.
- Seiten (26 HTML): index, About, Leistungen, Webdesign, Onlineshops, SEO, SEA, KI, KI-Automation,
  Referenzen, Kontakt, Aktuelles, Aktuell-virales-video-schweiz, AGB, Datenschutz, Impressum,
  Neu-Testseite, Referenz-* (9 Detailseiten: Batinu, Jobmaps, Reklamationszentrale, alpfrieden,
  baukonstrukt, bulgaria, flexpep, prodorso, wdvs). Onlineshops, Aktuelles und die
  Shop-/Marketing-Referenzen sind laut `README-Golive.md` derzeit ausgeblendet (nicht im Cyon-Upload).
  Alte Tilda-Referenzseiten (allvisa, en111, pkbasf, pkkfmv, eldur, rigaflex, Brawand) sind gelöscht.
- Slider auf Webdesign/Onlineshops/SEA und Focus auf index ziehen Kacheln, Bild und Zuschnitt live aus
  Referenzen.html (refslider.js `data-rs-source/-group`, image-slot `data-mirror="referenzen"`,
  gemeinsamer Sidecar `.image-slots-referenzen.state.json`). Reihenfolge = Referenzen.html, neuste oben.
- Kalender-Backend (Hostpoint): gehärtet (Header-Encoding, Slot-Validierung, flock-Rate-Limit in data/,
  HTTPS-only CORS, Webhook-Host-Allowlist, Honeypot + Zeitfeld `t`).
- Eigenständige Dokumente: Sommerferien-Laufband.html und Anleitung-flexpep-freischalten.html sind
  gelöscht; `doc-page.js` im Root wird von keiner Seite mehr geladen.
