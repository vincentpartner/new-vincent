# Umsetzung Codeprüfung vom 8. September 2026

Stand: 9. September 2026. Bezug: `Vincent_Codepruefung_2026-09-08.md`.

## Zusammenfassung

Von 17 nummerierten Befunden sind **14 umgesetzt**, 1 teilweise (U04), 2 nicht im Code lösbar (U03 fehlende Bilder, S02-Betriebsteil). Die Buchungslogik (`kalender/`) wurde überarbeitet: serialisierte Buchung mit Idempotenz-Schlüssel und fester Google-Event-ID, strenge FreeBusy-Validierung, atomares Rate-Limit vor allen Google-Aufrufen, Origin-/Content-Type-Prüfung, klare Antwortzustände (`booked` / `requested` / Fehler). Das Kontaktformular unterscheidet jetzt Live-Kalender, ausgebucht und Kalenderausfall, zeigt Zürcher Zeit, gibt Texte ohne `innerHTML` aus und blockiert Doppel-Submits. Offen bleiben Betriebsprüfungen auf Hostpoint (PHP-Laufzeit, Mailzustellung, Header) und fehlende Referenzbilder.

**Wichtig vor dem Upload:** In `kalender/config.php` echte OAuth-Werte eintragen. Die Einrichtung läuft nur noch mit `setup_enabled => true`, einem `setup_key` (≥ 24 Zeichen) und temporär gelockerter `.htaccess` (siehe Kopf von `oauth-setup.php`). Der Scope wurde auf `calendar.events` + `calendar.freebusy` reduziert – ein bestehender Refresh-Token mit altem Scope funktioniert weiter.

## Befunde im Detail

| ID | Status | Änderung |
|---|---|---|
| B01 | Umgesetzt | `book.php`: globale Buchungssperre (`data/booking.lock`, `flock`) um Kollisionsprüfung + Anlegen → auch überlappende Slots werden serialisiert. Vorgangsschlüssel `sha256(rid+start+email)` → feste Google-Event-ID `vp<key>`; Zustände `creating/booked/requested` in `data/bk-*.json`. Wiederholung liefert das gespeicherte Ergebnis (`replay:true`); nach Absturz mit `creating` wird das Event per GET geprüft. Google-409 (ID existiert) → bestehendes Event wird zurückgegeben. Frontend: `submitting`-Flag, `button.disabled`, `aria-busy`, Reset im `finally`; `rid` per `crypto.randomUUID()` pro Formularsitzung. |
| B02 | Umgesetzt | `google.php: g_freebusy()` prüft HTTP-Status, Vorhandensein des Kalenders, `errors`, Typ von `busy` und jede Zeitangabe. Unbekannt ≠ frei: `availability.php` antwortet mit `ok:false` (HTTP 502), `book.php` geht in die manuell zu bestätigende Anfrage (`state:requested`), nie in eine automatische Bestätigung. |
| S01 | Umgesetzt | `g_rate_take()` prüft **und** reserviert atomar unter `flock`; getrennte Kontingente `book_try` (12/h, vor Google-Aufrufen), `book_done` (5/h), `avail` (60/h). Speicher-/Sperrfehler → HTTP 503 `storage` (fail-closed). `availability.php` hat neu Rate-Limit + 60-s-Cache (`data/avail-cache.json`); Buchung prüft weiter frisch. Konfigurierbar in `config.php`. Nicht umgesetzt: E-Mail-Bestätigung / Captcha (Produktentscheid, siehe «Offen»). |
| S02 | Umgesetzt (Code) | `oauth-setup.php`: 404, solange `setup_enabled` false; Zugangsschlüssel `?key=` (`hash_equals`); HTTPS-Pflicht; sitzungsgebundener `state` (einmalig, `hash_equals`); minimale Scopes; nur der Refresh-Token wird ausgegeben, keine vollständige Antwort; `Cache-Control: no-store`. `.htaccess` sperrt die Datei zusätzlich (plus `*.lock`, `*.txt`). Betriebsteil offen: Datei nach Einrichtung vom Server löschen, Secrets ausserhalb des Quellcodes. |
| B03 | Umgesetzt | `availability.php`: `ok:true` + leere `collection` = ausgebucht; Slots nur, wenn Start **und** Ende im abgefragten Fenster liegen; FreeBusy-Abfrage um Puffer erweitert. `book.php`: Endzeit ≤ `lookahead_days` (kein Zusatztag). `Kontakt.html`: drei Zustände – **live** (Slots), **empty** («Aktuell keine freien Termine» + Kontaktwege, Absenden gesperrt), **fallback** («Wunschtermin · wird manuell bestätigt», Kopf-/Hinweistext und Button «Wunschtermin anfragen»). Ersatzvorschläge respektieren 24 h Vorlauf, Werktage, Arbeitszeit, Raster und werden in Zürcher Zeit berechnet. |
| S03 | Umgesetzt | Name, Datum und Terminkacheln per `textContent`/`createElement`; Meet-Link nur als DOM-Element und nur bei `https://meet.google.com`. |
| S04 | Umgesetzt | `g_require_trusted_request()`: vorhandener fremder `Origin` → 403 vor jeder Nebenwirkung; `Sec-Fetch-Site: cross-site` → 403; `book.php` verlangt `Content-Type: application/json` (sonst 415). Fehlender Origin (same-origin-Navigation, Bots) bleibt zugelassen und wird durch S01 begrenzt. |
| B04 | Umgesetzt | Honeypot → HTTP 400 `invalid`; Zeitprüfung → HTTP 429 `too_fast` mit korrigierbarer Meldung («…noch einmal senden»). Frontend zeigt Erfolg nur bei `ok:true`, `state` in {booked, requested} **und** gültigem `start`. |
| B05 | Umgesetzt | `post_webhook()` liefert `true` nur bei HTTP 2xx; `respond_fallback()` bestätigt nur bei tatsächlich erfolgreichem Mail **oder** Webhook, sonst 502 `no_channel`. Persistente Versandwarteschlange nicht umgesetzt (siehe «Offen»). |
| B06 | Umgesetzt | `render()` setzt `selected = null` und `aria-pressed` zurück; Submit prüft, dass genau eine sichtbare Kachel gewählt ist; `loadSeq` verwirft veraltete Antworten konkurrierender Ladevorgänge. |
| B07 | Umgesetzt | Alle Anzeigen mit `timeZone: 'Europe/Zurich'` und Beschriftung «(Zürich)» in Kacheln, Status, Kopftext und Bestätigung. Ersatzvorschläge werden aus Zürcher Wandzeit berechnet (Sommer-/Winterzeit via `Intl`). |
| U01 | Umgesetzt | `.slot.sel` nutzt `var(--bg)` statt `#fff` → Hell: #FFFFFF-ähnlich auf #2A2D31, Dunkel: #1B1D20 auf #D2D4D2 (≈ 11:1). Fokusring `:focus-visible` ergänzt. |
| U02 | Bereits vorhanden / ergänzt | `swiss.css` Zeile 322 zeigt `.nav-cta` im geöffneten Menü (Tablet 761–1180 px). Auf Smartphones (≤ 760 px) gibt es seit dem 9.9. die Bottom-Bar mit «Termin» und im Kachelmenü «Kontakt & Termin». Auf 390 und 820 px erreichbar. |
| U03 | Nicht umgesetzt (Inhalt) | Bilder können nicht generiert werden. Liste der Slots ohne Quelle unten. Editor-Skripte bleiben laut Projektregel bis zum Produktions-Build; Materialisierung steht als To-do in `CLAUDE.md`. |
| U04 | Teilweise | Formular: `required`/`aria-required`, `aria-invalid`, `aria-describedby` auf Fehlertexte, `role="alert"`/`aria-live` für Slot-Fehler, Buchungsfehler und Bestätigung, Fokus springt zum ersten fehlerhaften Feld, Kacheln mit `aria-pressed` + `aria-label`. Navigation: Burger mit `aria-expanded`/`aria-controls`/wechselndem Label, Esc schliesst (Desktop-Burger und mobile Bottom-Bar). Rechner: Range-Slider mit `aria-label`, Kacheln als `aria-pressed`-Buttons in `role="group"`. Pflichtfelder-Vertrag vereinheitlicht: Backend verlangt jetzt auch Unternehmen und Funktion. Offen: vollständiger Screenreader-Test. |
| D01 | Umgesetzt | `Datenschutz.html` Ziffer 5 beschreibt lokale Zwischenspeicherung (≤ 24 h), Übernahme ins Anliegen, Bearbeitbarkeit und Übermittlung erst beim Absenden. Kontaktformular: Hinweis unter dem Anliegen («…werden mit dem Formular an uns übermittelt») + Link Datenschutz beim Absende-Button. |
| U05 | Umgesetzt (technisch) | `calc.js` schreibt Abrechnungshinweis in die Zusammenfassung: «Geschätzte Investition: CHF … (Hinweis)» und «… / Mt. (pro Monat …)». Hinweis: Der SEO-Rechner ist in `SEO.html` `hidden`, also nicht sichtbar. Fachliche Klärung einmalig/monatlich (z. B. SEO-Audit) offen. |
| U06 | Umgesetzt | Verbindlicher Standard **Dunkel**: `tweaks.js` `DEFAULTS.mode = "Dunkel"`, Inline-Init auf allen 37 Seiten vereinfacht (gespeicherte Wahl, sonst Dunkel, kein `darkDefault`-Sonderfall). Head und Hauptskript liefern denselben Zustand. |

## Weitere Punkte aus der Tabelle

| Aufgabe | Status |
|---|---|
| Editor-Protokoll (`postMessage`) | Umgesetzt: Nachrichten nur, wenn die Seite eingebettet ist und `e.source === window.parent`; `__edit_mode_available` wird nur eingebettet gesendet. Hell/Dunkel-Schalter unabhängig davon. Vollständige Entfernung erst im Produktions-Build (Projektregel). |
| Anzeige ohne JavaScript | Teilweise: `<noscript>` auf allen Seiten hebt `.reveal` auf. Footer bleibt JS-generiert (`footer.js`) – Umbau auf statisches HTML wäre eine Vorlagenänderung an 37 Seiten, nicht gemacht. |
| Fehlerprotokoll | Umgesetzt: `g_log()` schreibt `data/log.txt` mit Zeit, Korrelations-ID (`X-Request-Id`, in JSON als `rid`), Kategorie; keine Tokens, keine Personendaten. Transportfehler (`code 0`) werden getrennt erkannt. |
| Produktions-Build, grosse Bilder, Animationen/`prefers-reduced-motion`, zentrale Vorlagen, SEO-Metadaten | Nicht umgesetzt (P3 bzw. bewusst nachgelagert laut `CLAUDE.md`). |

## Offen / Entscheid nötig

- **Bot-Hürde**: E-Mail-Bestätigung (Double-Opt-in) oder Captcha vor Kalendereintrag? Beides ändert den Buchungsablauf – bitte entscheiden.
- **Versandwarteschlange** für Fallback-Anfragen (B05): aktuell wird bei Versandfehler ehrlich 502 gemeldet; Speicherung + späterer Wiederversand nicht umgesetzt.
- **Betriebsprüfung Hostpoint**: PHP ≥ 8.0 mit cURL/mbstring, `mail()`-Zustellung mit Testadresse, `.htaccess`-Wirkung auf `kalender/data/`, HTTPS/HSTS/CSP-Header, Schreibrechte `kalender/data/`.
- **Testkalender**: B01/B02/S01 mit Parallel-Requests und simulierten Google-Fehlern durchspielen (PHP-Laufzeit nötig, hier nicht möglich).

## U03 – Bildplätze ohne Quelle (Stand statisches HTML + Sidecars)

Referenz-art-of-fondue, Referenz-foto-optik-grau, Referenz-metzgerei-steiner, Referenz-rueckenpraxis, Referenz-salsicceria, Referenz-landingpage-alpfrieden: Hauptbilder Desktop + Mobile fehlen.
Referenz-Batinu, Referenz-bulgaria: Hauptbild Mobile fehlt.
Fast alle Referenzen: Logo hell/dunkel, Fotos 1–2, Mobile-Serie m-1…m-4 unbefüllt.
Video-Referenzen (comparis, alpfrieden, reklamationszentrale, salsicceria): Video quer/hoch und Fotos fehlen.
