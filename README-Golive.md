# VinWeb Go-live v4 — Website für Cyon — Stand 10. September 2026

Inhalt: alle 34 öffentlichen Seiten, assets/, Sidecars (.state.json).
NICHT enthalten (liegen bereits auf Hostpoint unter api.vincent-partner.ch): kalender/, chat/.

## Upload auf Cyon
1. my.cyon.ch → Dateimanager (oder SFTP) → Webroot der Domain (`public_html/`).
2. Den INHALT dieses Ordners hochladen (nicht den Ordner selbst). Vorhandene Dateien ersetzen.
3. Versteckte Dateien (`.image-slots-*.state.json`, `.frames.state.json`, `.media-edits.state.json`) mit hochladen — sie enthalten per Editor ersetzte Bilder.

## Nach dem Upload prüfen
- index.html: Menü (Kacheln), Hell/Dunkel, Hero-Animation.
- Kontakt.html: Terminslots laden (Backend api.vincent-partner.ch/kalender/). Fehlt etwas: Domain `vincent-partner.ch` und `www.vincent-partner.ch` müssen in `kalender/config.php` → `origins` stehen.
- Webdesign.html → Sektion «Fragen Sie einfach.»: Frage stellen (Backend api.vincent-partner.ch/chat/chat/). Bei CORS-Fehler: Domain in `chat/config.php` → `allowed_hosts`.
- Auf Hostpoint `chat/chat/test.php` löschen.

## Neu seit v3
- Mobile Navigation fixiert beim Scrollen.
- KI-Automation: erste Animation auf Mobil quadratisch, Bahnen verkleinert; CTA-Kreise mobil kleiner und dauerhaft sichtbar.
- Preisrechner und SEO/GEO-Pakete archiviert (nicht im Export).
- Chatbot-Sektion «Fragen & Antworten» auf Webdesign.html (assets/askbot.js/.css).
- Kontakt-Buchung ruft Backend absolut auf api.vincent-partner.ch auf.
