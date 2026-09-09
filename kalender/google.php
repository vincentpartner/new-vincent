<?php
/* ───────────────────────────────────────────────────────────────────────────
   Gemeinsame Helfer: Google-Access-Token, API-Aufrufe, CORS/Origin-Prüfung,
   FreeBusy-Validierung, Rate-Limit (atomar), Protokoll.
   ─────────────────────────────────────────────────────────────────────────── */

function g_config() {
  static $c = null;
  if ($c === null) { $c = require __DIR__ . '/config.php'; }
  return $c;
}

/* Geschütztes Datenverzeichnis (Token-Cache, Rate-Limit, Buchungsprotokoll) in kalender/.
   Per .htaccess für den Browser gesperrt, Dateirechte nur für den PHP-Benutzer. */
function g_data_dir() {
  $dir = __DIR__ . '/data';
  if (!is_dir($dir)) { @mkdir($dir, 0700, true); @file_put_contents($dir . '/.htaccess', "Require all denied\n"); }
  return $dir;
}

/* Korrelations-ID pro Anfrage (in Antwort + Protokoll). */
function g_rid() {
  static $rid = null;
  if ($rid === null) { $rid = bin2hex(random_bytes(6)); }
  return $rid;
}

/* Ereignisprotokoll: Kategorie + Details, ohne Tokens oder Personendaten. */
function g_log($cat, $detail = '') {
  $line = date('c') . ' ' . g_rid() . ' ' . $cat . ($detail !== '' ? ' ' . preg_replace('/\s+/', ' ', (string)$detail) : '') . "\n";
  @file_put_contents(g_data_dir() . '/log.txt', $line, FILE_APPEND | LOCK_EX);
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
    CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query([
      'client_id' => $c['client_id'], 'client_secret' => $c['client_secret'],
      'refresh_token' => $c['refresh_token'], 'grant_type' => 'refresh_token',
    ]),
    CURLOPT_TIMEOUT => 10,
  ]);
  $raw = curl_exec($ch);
  $err = curl_error($ch);
  curl_close($ch);
  $r = json_decode((string)$raw, true);
  if (empty($r['access_token'])) { g_log('token_fail', $err ?: ($r['error'] ?? 'no_token')); return null; }
  $tmp = $cacheFile . '.' . getmypid() . '.tmp';
  if (@file_put_contents($tmp, json_encode(['tok' => $r['access_token'], 'exp' => time() + (int)($r['expires_in'] ?? 3600)])) !== false) {
    @chmod($tmp, 0600); @rename($tmp, $cacheFile);
  }
  return $r['access_token'];
}

/* Generischer Calendar-API-Aufruf. Gibt [http_code, decoded_json] zurück; 0 = Transportfehler. */
function g_api($method, $url, $token, $body = null) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
    CURLOPT_TIMEOUT => 12,
  ]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  $resp = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);
  if ($resp === false || $code === 0) { g_log('api_transport', $method . ' ' . parse_url($url, PHP_URL_PATH) . ' ' . $err); return [0, null]; }
  $j = json_decode($resp, true);
  if ($code < 200 || $code >= 300) { g_log('api_http_' . $code, $method . ' ' . parse_url($url, PHP_URL_PATH) . ' ' . ($j['error']['message'] ?? '')); }
  return [$code, $j];
}

/* FreeBusy-Antwort streng prüfen. Rückgabe: ['ok'=>bool, 'busy'=>[[start,end]...] , 'why'=>string]
   Ein HTTP-200 mit Kalenderfehler, fehlendem Kalender oder falschem Typ gilt als UNBEKANNT, nie als frei. */
function g_freebusy($token, $timeMin, $timeMax) {
  $c = g_config();
  list($code, $fb) = g_api('POST', 'https://www.googleapis.com/calendar/v3/freeBusy', $token, [
    'timeMin' => $timeMin, 'timeMax' => $timeMax, 'timeZone' => $c['timezone'],
    'items' => [['id' => $c['calendar_id']]],
  ]);
  if ($code < 200 || $code >= 300) return ['ok' => false, 'busy' => [], 'why' => 'http_' . $code];
  $cal = $fb['calendars'][$c['calendar_id']] ?? null;
  if (!is_array($cal)) { g_log('freebusy_nocal'); return ['ok' => false, 'busy' => [], 'why' => 'no_calendar']; }
  if (!empty($cal['errors'])) { g_log('freebusy_calerr', json_encode($cal['errors'])); return ['ok' => false, 'busy' => [], 'why' => 'calendar_error']; }
  if (!array_key_exists('busy', $cal) || !is_array($cal['busy'])) { g_log('freebusy_nobusy'); return ['ok' => false, 'busy' => [], 'why' => 'no_busy']; }
  $out = [];
  foreach ($cal['busy'] as $b) {
    $s = isset($b['start']) ? strtotime($b['start']) : false;
    $e = isset($b['end']) ? strtotime($b['end']) : false;
    if ($s === false || $e === false) { g_log('freebusy_badrange'); return ['ok' => false, 'busy' => [], 'why' => 'bad_range']; }
    $out[] = [$s, $e];
  }
  return ['ok' => true, 'busy' => $out, 'why' => ''];
}

/* Erlaubte Origins: konfigurierte Liste + eigener Host (same-origin). */
function g_origin_allowed($o) {
  $c = g_config();
  if ($o === '' || $o === 'null') return false;
  if (in_array($o, $c['origins'], true)) return true;
  $host = $_SERVER['HTTP_HOST'] ?? '';
  return $host !== '' && (strcasecmp($o, 'https://' . $host) === 0);
}

/* CORS-Header nur für gelistete HTTPS-Origins; sonst kein Freigabeheader.
   Abweisen fremder Origins übernimmt g_require_trusted_request() (vor Nebenwirkungen). */
function g_cors() {
  $o = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($o !== '' && stripos($o, 'https://') === 0 && g_origin_allowed($o)) {
    header('Access-Control-Allow-Origin: ' . $o);
    header('Vary: Origin');
  }
  header('Content-Type: application/json; charset=utf-8');
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: no-store');
  header('X-Request-Id: ' . g_rid());
}

/* Nur eigene Browser-Anfragen: vorhandener Origin muss erlaubt sein, Sec-Fetch-Site
   darf nicht cross-site sein, JSON-Body braucht Content-Type application/json. */
function g_require_trusted_request($needJson) {
  $o = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($o !== '' && !g_origin_allowed($o)) { g_log('reject_origin', $o); http_response_code(403); echo json_encode(['ok' => false, 'error' => 'origin']); exit; }
  $sfs = strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
  if ($sfs === 'cross-site') { g_log('reject_fetchsite'); http_response_code(403); echo json_encode(['ok' => false, 'error' => 'origin']); exit; }
  if ($needJson) {
    $ct = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($ct !== 'application/json') { g_log('reject_ctype', $ct); http_response_code(415); echo json_encode(['ok' => false, 'error' => 'content_type']); exit; }
  }
}

/* Atomares Rate-Limit: prüft UND reserviert in einem gesperrten Dateizugriff.
   $bucket trennt Zähler (z. B. 'book_try', 'book_done', 'avail'). Rückgabe:
   true = erlaubt (und gezählt), false = Limit erreicht, null = Speicher nicht verfügbar. */
function g_rate_take($bucket, $ip, $max, $windowSec = 3600) {
  $file = g_data_dir() . '/ratelimit.json';
  $key = $bucket . ':' . hash('sha256', $ip);
  $fh = @fopen($file, 'c+');
  if (!$fh) { g_log('rate_storage_fail'); return null; }
  if (!flock($fh, LOCK_EX)) { fclose($fh); g_log('rate_lock_fail'); return null; }
  $raw = stream_get_contents($fh);
  $all = json_decode($raw ?: '{}', true) ?: [];
  $now = time();
  foreach ($all as $k => $ts) {
    $all[$k] = array_values(array_filter((array)$ts, fn($t) => $t > $now - 86400));
    if (!$all[$k]) unset($all[$k]);
  }
  $recent = array_filter($all[$key] ?? [], fn($t) => $t > $now - $windowSec);
  $ok = count($recent) < $max;
  if ($ok) { $all[$key][] = $now; }
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($all)); fflush($fh);
  flock($fh, LOCK_UN); fclose($fh);
  if (!$ok) g_log('rate_hit', $bucket);
  return $ok;
}
