<?php
/* ───────────────────────────────────────────────────────────────────────────
   book.php – erstellt den Termin im Google-Kalender und lädt beide Seiten ein.
   Erwartet POST (JSON, Content-Type application/json):
     { rid, name, email, company, func, message, start, website, t }
   "rid" = Client-Vorgangs-ID (Idempotenz), "website" = Honeypot, "t" = Ladezeitpunkt (ms).
   Antwort: { ok:true, state:"booked",    start, htmlLink, meet }
            { ok:true, state:"requested", start }              (manuell zu bestätigen)
            { ok:false, error }   error: invalid | too_fast | time | rate | taken | origin | content_type | storage | no_channel
   ─────────────────────────────────────────────────────────────────────────── */

require __DIR__ . '/google.php';
g_cors();

/* ── Eingabe-Bereinigung ───────────────────────────────────────────────────── */
function clean_line($v, $max) {
  $v = is_string($v) ? $v : '';
  $v = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v);
  $v = trim(preg_replace('/\s+/u', ' ', $v));
  return mb_substr($v, 0, $max);
}
function clean_text($v, $max) {
  $v = is_string($v) ? $v : '';
  $v = str_replace(["\r\n", "\r"], "\n", $v);
  $v = preg_replace('/[^\P{C}\n]+/u', '', $v);
  return mb_substr(trim($v), 0, $max);
}
function hdr($v) {
  $v = preg_replace('/[\r\n\x00-\x1F\x7F]/', '', (string)$v);
  return preg_match('/[^\x20-\x7E]/', $v) ? '=?UTF-8?B?' . base64_encode($v) . '?=' : $v;
}
function json_fail($code, $err) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $err, 'rid' => g_rid()]);
  exit;
}

/* ── Versandkanäle (liefern ausgewertetes Ergebnis) ────────────────────────── */
function send_mail_fallback($c, $d) {
  $to = $c['notify_email'] ?? '';
  if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
  try { $dt = new DateTime($d['start']); $dt->setTimezone(new DateTimeZone($c['timezone'])); $when = $dt->format('d.m.Y, H:i') . ' Uhr'; }
  catch (Exception $e) { $when = $d['start']; }
  $subject = 'Neue Terminanfrage – ' . $d['name'];
  $body = implode("\n", [
    'Neue Terminanfrage über das Website-Kontaktformular.',
    isset($d['_note']) ? ("\n" . $d['_note'] . "\n") : '',
    'Wunschtermin: ' . $when . '  (Dauer ' . $c['slot_minutes'] . ' Min., ' . $c['timezone'] . ')',
    'Vorgang:      ' . ($d['_key'] ?? g_rid()),
    '',
    'Name:        ' . $d['name'],
    'E-Mail:      ' . $d['email'],
    'Unternehmen: ' . ($d['company'] !== '' ? $d['company'] : '—'),
    'Funktion:    ' . ($d['func'] !== '' ? $d['func'] : '—'),
    '',
    'Anliegen:',
    ($d['message'] !== '' ? $d['message'] : '—'),
  ]);
  $from = $c['from_email'] ?? ('no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
  if (!filter_var($from, FILTER_VALIDATE_EMAIL)) $from = 'no-reply@localhost';
  $headers = ['From: Website <' . $from . '>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit'];
  if (filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $headers[] = 'Reply-To: ' . hdr($d['name']) . ' <' . $d['email'] . '>';
  $ok = @mail($to, hdr($subject), $body, implode("\r\n", $headers));
  if (!$ok) g_log('mail_fail');
  return (bool)$ok;
}

/* Optionaler Webhook-POST – nur an erlaubte HTTPS-Hosts. true nur bei HTTP 2xx. */
function post_webhook($c, $d) {
  $url = $c['webhook_url'] ?? '';
  if (!$url) return false;
  $p = parse_url($url);
  $host = strtolower($p['host'] ?? '');
  $allowed = array_map('strtolower', $c['webhook_hosts'] ?? []);
  if (($p['scheme'] ?? '') !== 'https' || $host === '' || !in_array($host, $allowed, true)) { g_log('webhook_host_denied', $host); return false; }
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($d), CURLOPT_TIMEOUT => 8,
    CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
  ]);
  $r = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $ok = $r !== false && $code >= 200 && $code < 300;
  if (!$ok) g_log('webhook_fail', 'http_' . $code);
  return $ok;
}

/* Manuelle Anfrage (Kalender nicht verlässlich): nur bei bestätigtem Versand ok:true. */
function respond_fallback($c, $d, $why) {
  g_log('fallback', $why);
  if (!isset($d['_note'])) $d['_note'] = 'Hinweis: Automatische Kalendereintragung war nicht möglich (' . $why . ') – bitte den Termin manuell bestätigen.';
  $mail = send_mail_fallback($c, $d);
  $hook = post_webhook($c, $d);
  if ($mail || $hook) {
    record_save($d['_key'], ['state' => 'requested', 'start' => $d['start']]);
    echo json_encode(['ok' => true, 'state' => 'requested', 'start' => $d['start'], 'rid' => g_rid()]);
  } else {
    json_fail(502, 'no_channel');
  }
  exit;
}

/* ── Buchungsprotokoll (Idempotenz) ────────────────────────────────────────── */
function record_path($key) { return g_data_dir() . '/bk-' . $key . '.json'; }
function record_load($key) { $f = record_path($key); return is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null; }
function record_save($key, $data) { $data['t'] = time(); @file_put_contents(record_path($key), json_encode($data), LOCK_EX); }
function record_gc() { foreach (glob(g_data_dir() . '/bk-*.json') ?: [] as $f) { if (@filemtime($f) < time() - 3 * 86400) @unlink($f); } }
function respond_record($r) {
  echo json_encode(['ok' => true, 'state' => $r['state'], 'start' => $r['start'], 'htmlLink' => $r['htmlLink'] ?? null, 'meet' => $r['meet'] ?? null, 'rid' => g_rid(), 'replay' => true]);
  exit;
}

/* ── Request ───────────────────────────────────────────────────────────────── */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  http_response_code(204);
  exit;
}
if ($method !== 'POST') json_fail(405, 'method');
g_require_trusted_request(true);

$c   = g_config();
$raw = file_get_contents('php://input', false, null, 0, 16384);
$in  = json_decode($raw ?: '', true);
if (!is_array($in)) json_fail(400, 'invalid');

// Bot-Hürden: klar als Fehler beantworten (kein falsches „gebucht")
if (!empty($in['website'])) { g_log('honeypot'); json_fail(400, 'invalid'); }
if (isset($in['t']) && is_numeric($in['t'])) {
  $age = round(microtime(true) * 1000) - (float)$in['t'];
  if ($age >= 0 && $age < 3000) { g_log('too_fast'); json_fail(429, 'too_fast'); }
}

$name    = clean_line($in['name'] ?? '', 120);
$email   = clean_line($in['email'] ?? '', 200);
$start   = clean_line($in['start'] ?? '', 40);
$company = clean_line($in['company'] ?? '', 160);
$func    = clean_line($in['func'] ?? '', 80);
$msg     = clean_text($in['message'] ?? '', 4000);
$rid     = preg_replace('/[^A-Za-z0-9\-]/', '', (string)($in['rid'] ?? ''));

// Pflichtfelder wie im Formular: Name, E-Mail, Unternehmen, Funktion, Termin
if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $start === '' || $company === '' || $func === '') json_fail(400, 'invalid');

// Versuchs-Limit VOR allen teuren Aufrufen, atomar, fail-closed
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$rl = g_rate_take('book_try', $ip, (int)($c['attempt_limit_per_hour'] ?? 12));
if ($rl === null) json_fail(503, 'storage');
if ($rl === false) json_fail(429, 'rate');

// Startzeit: striktes ISO-8601, Vorlauf, Fenster, Arbeitstag/-zeit, Raster
$tz = new DateTimeZone($c['timezone']);
if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})$/', $start)) json_fail(400, 'time');
try { $startDt = new DateTime($start); } catch (Exception $e) { json_fail(400, 'time'); }
$startDt->setTimezone($tz);
$now = new DateTime('now', $tz);
$minStart = (clone $now)->modify('+' . (int)$c['min_notice_h'] . ' hours');
$maxEnd   = (clone $now)->modify('+' . (int)$c['lookahead_days'] . ' days');
$endDt = (clone $startDt)->modify('+' . (int)$c['slot_minutes'] . ' minutes');
if ($startDt < $minStart || $endDt > $maxEnd) json_fail(400, 'time');
if (!in_array((int)$startDt->format('N'), $c['work_days'], true)) json_fail(400, 'time');
list($wsH, $wsM) = array_map('intval', explode(':', $c['work_start']));
list($weH, $weM) = array_map('intval', explode(':', $c['work_end']));
$minOfDay = (int)$startDt->format('G') * 60 + (int)$startDt->format('i');
if ((int)$startDt->format('s') !== 0 || ($minOfDay - ($wsH * 60 + $wsM)) % (int)$c['step_minutes'] !== 0) json_fail(400, 'time');
if ($minOfDay < $wsH * 60 + $wsM || $minOfDay + (int)$c['slot_minutes'] > $weH * 60 + $weM) json_fail(400, 'time');

// Vorgangsschlüssel: gleicher Client-Vorgang + gleicher Termin + gleiche Adresse = derselbe Buchungsvorgang
$key = substr(hash('sha256', $rid . '|' . $startDt->format('c') . '|' . strtolower($email)), 0, 40);
$eventId = 'vp' . $key;   // gültige Google-Event-ID (0-9a-v), verhindert Doppelanlage nach Antwortverlust

$payload = ['name' => $name, 'email' => $email, 'company' => $company, 'func' => $func, 'message' => $msg, 'start' => $startDt->format('c'), '_key' => $key];

// Bereits abgeschlossener Vorgang → Ergebnis erneut liefern (Wiederholung nach Antwortverlust)
if ($rid !== '' && ($rec = record_load($key)) && in_array($rec['state'] ?? '', ['booked', 'requested'], true)) { g_log('replay', $rec['state']); respond_record($rec); }

// Globale Buchungssperre: Kollisionsprüfung + Anlegen laufen serialisiert (auch für überlappende Slots)
set_time_limit(60);
$lockFh = @fopen(g_data_dir() . '/booking.lock', 'c');
if (!$lockFh || !flock($lockFh, LOCK_EX)) json_fail(503, 'storage');
record_gc();

$token = g_access_token();
if (!$token) { respond_fallback($c, $payload, 'auth'); }

// Angefangener, nicht abgeschlossener Vorgang (Absturz nach Insert?) → Status beim Kalender klären
$eventUrl = 'https://www.googleapis.com/calendar/v3/calendars/' . rawurlencode($c['calendar_id']) . '/events/' . $eventId;
if ($rid !== '' && ($rec = record_load($key)) && ($rec['state'] ?? '') === 'creating') {
  list($gc, $gev) = g_api('GET', $eventUrl, $token);
  if ($gc === 200 && ($gev['status'] ?? '') !== 'cancelled') {
    $done = ['state' => 'booked', 'start' => $payload['start'], 'htmlLink' => $gev['htmlLink'] ?? null, 'meet' => $gev['hangoutLink'] ?? null];
    record_save($key, $done); g_log('recovered'); respond_record($done);
  }
}

// Letzter Kollisions-Check direkt vor dem Anlegen (inkl. Puffer), streng validiert
$fb = g_freebusy($token,
  (clone $startDt)->modify('-' . (int)$c['buffer_minutes'] . ' minutes')->format('c'),
  (clone $endDt)->modify('+' . (int)$c['buffer_minutes'] . ' minutes')->format('c'));
if (!$fb['ok']) { respond_fallback($c, $payload, 'freebusy_' . $fb['why']); }
if (!empty($fb['busy'])) { g_log('taken'); json_fail(409, 'taken'); }

// Abgeschlossene Buchungen pro IP begrenzen (zweites Kontingent, ebenfalls atomar)
$rl2 = g_rate_take('book_done', $ip, (int)($c['rate_limit_per_hour'] ?? 5));
if ($rl2 === null) json_fail(503, 'storage');
if ($rl2 === false) json_fail(429, 'rate');

$desc = "Anfrage über das Website-Kontaktformular.\n";
if ($company) $desc .= "Unternehmen: $company\n";
if ($func)    $desc .= "Funktion: $func\n";
if ($msg)     $desc .= "Anliegen: $msg\n";
$desc .= "Vorgang: $key\n";

$event = [
  'id'          => $eventId,
  'summary'     => $c['event_title'] . ' – ' . $name,
  'description' => $desc,
  'start'       => ['dateTime' => $startDt->format('c'), 'timeZone' => $c['timezone']],
  'end'         => ['dateTime' => $endDt->format('c'),   'timeZone' => $c['timezone']],
  'attendees'   => [['email' => $email, 'displayName' => $name]],
  'reminders'   => ['useDefault' => true],
];
$url = 'https://www.googleapis.com/calendar/v3/calendars/' . rawurlencode($c['calendar_id']) . '/events?sendUpdates=all';
if (!empty($c['add_meet_link'])) {
  $url .= '&conferenceDataVersion=1';
  $event['conferenceData'] = ['createRequest' => ['requestId' => 'vp' . $key, 'conferenceSolutionKey' => ['type' => 'hangoutsMeet']]];
}

record_save($key, ['state' => 'creating', 'start' => $payload['start']]);
list($code, $ev) = g_api('POST', $url, $token, $event);
if ($code === 409) { // Event-ID existiert bereits (frühere Anfrage kam durch) → bestehendes Event verwenden
  list($code, $ev) = g_api('GET', $eventUrl, $token);
  if ($code === 200 && ($ev['status'] ?? '') === 'cancelled') $code = 0;
}
if ($code < 200 || $code >= 300) { respond_fallback($c, $payload, 'insert_' . $code); }

$done = ['state' => 'booked', 'start' => $startDt->format('c'), 'htmlLink' => $ev['htmlLink'] ?? null, 'meet' => $ev['hangoutLink'] ?? null];
record_save($key, $done);
g_log('booked');
flock($lockFh, LOCK_UN); fclose($lockFh);

if (!empty($c['notify_on_success'])) { $payload['_note'] = 'Wurde automatisch im Kalender eingetragen (Kopie).'; send_mail_fallback($c, $payload); }

echo json_encode(['ok' => true, 'state' => 'booked', 'start' => $done['start'], 'htmlLink' => $done['htmlLink'], 'meet' => $done['meet'], 'rid' => g_rid()]);
