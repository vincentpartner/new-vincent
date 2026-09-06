<?php
/* ───────────────────────────────────────────────────────────────────────────
   oauth-setup.php – EINMALIG ausführen, um den Refresh-Token zu erzeugen.
   Ablauf:
     1. In config.php client_id, client_secret und redirect_uri eintragen.
     2. Diese Datei im Browser öffnen:
        https://www.vincent-partner.ch/kalender/oauth-setup.php
     3. Mit dem Google-Konto (Reto / Workspace) anmelden & Zugriff erlauben.
     4. Den angezeigten Refresh-Token in config.php bei 'refresh_token' eintragen.
     5. Diese Datei (oauth-setup.php) anschliessend LÖSCHEN.
   ─────────────────────────────────────────────────────────────────────────── */

$c = require __DIR__ . '/config.php';
$scope = 'https://www.googleapis.com/auth/calendar';

// Schritt A: noch kein Code → zu Google weiterleiten
if (!isset($_GET['code'])) {
  $auth = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
    'client_id'     => $c['client_id'],
    'redirect_uri'  => $c['redirect_uri'],
    'response_type' => 'code',
    'scope'         => $scope,
    'access_type'   => 'offline',
    'prompt'        => 'consent',   // erzwingt einen frischen Refresh-Token
  ]);
  header('Location: ' . $auth);
  exit;
}

// Schritt B: Code gegen Tokens tauschen
$ch = curl_init('https://oauth2.googleapis.com/token');
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query([
    'code'          => $_GET['code'],
    'client_id'     => $c['client_id'],
    'client_secret' => $c['client_secret'],
    'redirect_uri'  => $c['redirect_uri'],
    'grant_type'    => 'authorization_code',
  ]),
  CURLOPT_TIMEOUT => 10,
]);
$r = json_decode(curl_exec($ch), true);
curl_close($ch);

header('Content-Type: text/plain; charset=utf-8');

if (!empty($r['refresh_token'])) {
  echo "ERFOLG!\n\n";
  echo "Kopiere diesen Refresh-Token in config.php bei 'refresh_token':\n\n";
  echo $r['refresh_token'] . "\n\n";
  echo "Danach diese Datei (oauth-setup.php) LÖSCHEN.";
} else {
  echo "Kein refresh_token erhalten. Antwort von Google:\n\n";
  print_r($r);
  echo "\n\nTipp: Unter https://myaccount.google.com/permissions den App-Zugriff\n";
  echo "entfernen und erneut versuchen (prompt=consent erzwingt einen neuen Token).";
}
