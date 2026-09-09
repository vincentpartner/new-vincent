<?php
/* ───────────────────────────────────────────────────────────────────────────
   oauth-setup.php – EINMALIG ausführen, um den Refresh-Token zu erzeugen.
   Standardmässig GESPERRT (.htaccess + 'setup_enabled' => false in config.php).
   Ablauf:
     1. In config.php client_id, client_secret, redirect_uri eintragen,
        'setup_enabled' => true und ein langes 'setup_key' setzen.
     2. In kalender/.htaccess die Sperre für oauth-setup.php vorübergehend entfernen.
     3. Aufrufen: https://vincent-partner.ch/kalender/oauth-setup.php?key=<setup_key>
     4. Mit dem Google-Konto anmelden & Zugriff erlauben.
     5. Angezeigten Refresh-Token in config.php bei 'refresh_token' eintragen.
     6. 'setup_enabled' => false setzen, .htaccess-Sperre wieder aktivieren,
        Datei am besten vom Server LÖSCHEN.
   ─────────────────────────────────────────────────────────────────────────── */

$c = require __DIR__ . '/config.php';
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function setup_deny($code, $msg) { http_response_code($code); echo $msg; exit; }

if (empty($c['setup_enabled'])) setup_deny(404, 'Nicht verfügbar.');
$key = $c['setup_key'] ?? '';
if (strlen($key) < 24) setup_deny(500, 'setup_key in config.php muss mindestens 24 Zeichen lang sein.');
if (($_SERVER['HTTPS'] ?? '') === '' && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') !== 'https') setup_deny(400, 'Nur über HTTPS.');

session_set_cookie_params(['secure' => true, 'httponly' => true, 'samesite' => 'Lax', 'path' => '/kalender/']);
session_name('vp_setup');
session_start();

// Minimale Scopes: Termine anlegen/lesen + FreeBusy
$scope = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';

// Schritt A: Start → Zugangsschlüssel prüfen, state erzeugen, zu Google weiterleiten
if (!isset($_GET['code'])) {
  if (!hash_equals($key, (string)($_GET['key'] ?? ''))) setup_deny(403, 'Zugriff verweigert.');
  $state = bin2hex(random_bytes(24));
  $_SESSION['oauth_state'] = $state;
  $_SESSION['oauth_ok'] = true;
  $auth = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
    'client_id' => $c['client_id'], 'redirect_uri' => $c['redirect_uri'], 'response_type' => 'code',
    'scope' => $scope, 'access_type' => 'offline', 'prompt' => 'consent', 'state' => $state,
  ]);
  header('Location: ' . $auth);
  exit;
}

// Schritt B: Rückruf → state muss zur gestarteten Sitzung passen (einmalig)
$expected = $_SESSION['oauth_state'] ?? '';
unset($_SESSION['oauth_state']);
if (empty($_SESSION['oauth_ok']) || $expected === '' || !hash_equals($expected, (string)($_GET['state'] ?? ''))) setup_deny(403, 'Ungültiger oder fehlender state – Vorgang neu starten.');
session_destroy();

$ch = curl_init('https://oauth2.googleapis.com/token');
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query([
    'code' => $_GET['code'], 'client_id' => $c['client_id'], 'client_secret' => $c['client_secret'],
    'redirect_uri' => $c['redirect_uri'], 'grant_type' => 'authorization_code',
  ]),
  CURLOPT_TIMEOUT => 10,
]);
$r = json_decode((string)curl_exec($ch), true);
curl_close($ch);

if (!empty($r['refresh_token'])) {
  echo "ERFOLG!\n\nRefresh-Token (in config.php bei 'refresh_token' eintragen):\n\n" . $r['refresh_token'] . "\n\n";
  echo "Danach: 'setup_enabled' => false, .htaccess-Sperre aktivieren, Datei löschen.";
} else {
  echo "Kein refresh_token erhalten. Fehler: " . ($r['error'] ?? 'unbekannt') . ' – ' . ($r['error_description'] ?? '') . "\n\n";
  echo "Tipp: Unter https://myaccount.google.com/permissions den App-Zugriff entfernen und erneut versuchen.";
}
