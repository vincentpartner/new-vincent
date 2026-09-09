# VinWeb Go-live v3 — Stand 9. September 2026

Inhalt: alle 37 Seiten, assets/, kalender/ (inkl. .htaccess), Sidecars (.state.json), doc-page.js.

## Vor dem Upload auf Hostpoint
1. `kalender/config.php`: echte OAuth-Werte (client_id, client_secret, calendar_id) eintragen. Für die Einrichtung `setup_enabled => true` + `setup_key` (≥ 24 Zeichen), `.htaccess` temporär lockern (siehe Kopf von `oauth-setup.php`).
2. `kalender/data/` anlegen und beschreibbar machen.
3. `oauth-setup.php?key=…` einmal aufrufen, Refresh-Token in `config.php` eintragen, danach `setup_enabled => false` und `oauth-setup.php` vom Server löschen.
4. Ordner**inhalt** (nicht den Ordner) ins Webroot hochladen.
5. Testen: Kontakt.html lädt Slots (`/kalender/availability.php`), Testbuchung, Mobil-Menü, Hell/Dunkel, echtes Smartphone.

## Neu seit v2
- Top-Navigation mit Kachelmenü, Bottom-Bar entfernt.
- Mobile-Hero: Pfeil-Button als Physikkörper, Buchstaben prallen ab.
- Alle 37 Seiten standardmässig dunkel.
- kalender/-Backend gehärtet (Idempotenz per Event-ID, atomares Rate-Limit, Origin-Prüfung, FreeBusy-Validierung).

Details zur Codeprüfung: `Codepruefung-Umsetzung-2026-09-09.md` im Projekt.
