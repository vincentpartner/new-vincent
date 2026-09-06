<?php
/* ───────────────────────────────────────────────────────────────────────────
   Gemeinsame Helfer: Google-Access-Token, API-Aufrufe, CORS.
   ─────────────────────────────────────────────────────────────────────────── */

function g_config() {
  static $c = null;
  if ($c === null) { $c = require __DIR__ . '/config.php'; }
  return $c;
}

/* Geschütztes Datenverzeichnis (Token-Cache, Rate-Limit) innerhalb von kalender/.
   Per .htaccess für den Browser gesperrt, Dateirechte nur für den PHP-Benutzer. */
function g_data_dir() {
  $dir = __DIR__ . '/data';
  if (!is_dir($dir)) { @mkdir($dir, 0700, true); @file_put_contents($dir . '/.htaccess', "Require all denied\n"); }
  return $dir;
}

/* Access-Token aus dem Refresh-Token holen (gültig ~1 Std., kurz gecacht).
   Gecacht wird nur das kurzlebige Access-Token, nie das Refresh-Token. */
function g_access_token() {
  $c = g_config();

  $cacheFile = g_data_dir() . '/token.json';
  if (is_file($cacheFile)) {
    $d = json_decode(@file_get_contents($cacheFile), true);
    if ($d && ($d['exp'] ?? 0) > time() + 60) { return $d['tok']; }
  }

  $ch = curl_init('https://oauth2.googleapis.com/token');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query([
      'client_id'     => $c['client_id'],
      'client_secret' => $c['client_secret'],
      'refresh_token' => $c['refresh_token'],
      'grant_type'    => 'refresh_token',
    ]),
    CURLOPT_TIMEOUT => 10,
  ]);
  $r = json_decode(curl_exec($ch), true);
  curl_close($ch);

  if (empty($r['access_token'])) { return null; }
  $tmp = $cacheFile . '.' . getmypid() . '.tmp';
  if (@file_put_contents($tmp, json_encode([
    'tok' => $r['access_token'],
    'exp' => time() + (int)($r['expires_in'] ?? 3600),
  ])) !== false) { @chmod($tmp, 0600); @rename($tmp, $cacheFile); }
  return $r['access_token'];
}

/* Generischer Calendar-API-Aufruf. Gibt [http_code, decoded_json] zurück. */
function g_api($method, $url, $token, $body = null) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => [
      'Authorization: Bearer ' . $token,
      'Content-Type: application/json',
    ],
    CURLOPT_TIMEOUT => 12,
  ]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return [$code, json_decode($resp, true)];
}

/* CORS-Header: nur exakt gelistete HTTPS-Origins (same-origin-Aufrufe senden
   keinen Origin-Header und brauchen kein CORS). Wildcard wird ignoriert. */
function g_cors() {
  $c = g_config();
  $o = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($o !== '' && stripos($o, 'https://') === 0 && in_array($o, $c['origins'], true)) {
    header('Access-Control-Allow-Origin: ' . $o);
    header('Vary: Origin');
  }
  header('Content-Type: application/json; charset=utf-8');
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: no-store');
}
