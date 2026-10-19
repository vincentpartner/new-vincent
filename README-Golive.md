# VinWeb Go-live v5 — Website für Cyon — Stand 19. Oktober 2026

Inhalt: 22 öffentliche Seiten, assets/, Sidecars (.state.json).
NICHT enthalten (liegen auf Hostpoint unter api.vincent-partner.ch): kalender/, chat/.
Bewusst nicht enthalten: ausgeblendete Seiten (Onlineshops, Aktuelles, Shop- und Marketing-Referenzen, Rückenpraxis), Archiv-Preisrechner + calc.js, Anleitungen, Designsystem.

## Upload auf Cyon
1. my.cyon.ch → Dateimanager (oder SFTP) → Webroot `public_html/`.
2. Den INHALT dieses Ordners hochladen (nicht den Ordner selbst). Vorhandene Dateien ersetzen.
3. Versteckte Dateien (`.image-slots-*.state.json`, `.frames.state.json`, `.media-edits*.state.json`, `.collage-about.state.json`) mit hochladen.
4. Alte Dateien vom Server löschen, die nicht mehr im Ordner sind (z. B. Onlineshops.html, Aktuelles.html, alte Referenz-Seiten).

## Hostpoint
- `kalender/` und `chat/` aktualisieren, Configs nicht überschreiben.
- `kalender/config.php` → `origins` und `chat/config.php` → `allowed_hosts` + `chat/.htaccess`: `vincent-partner.ch` und `www.vincent-partner.ch`.
- Testdateien in `chat/` löschen.

## Nach dem Upload prüfen (Desktop + Handy)
- index.html: Kacheln, Focus-Videos, Kundenstimmen-Pfeile, Hell/Dunkel.
- Kontakt.html: Terminslots laden und Buchung.
- Chat «Fragen & Antworten» auf Webdesign, SEA, SEO, KI-Automation, Kontakt.
- Handy-Menü.
