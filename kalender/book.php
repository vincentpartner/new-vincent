<?php
/* ───────────────────────────────────────────────────────────────────────────
   book.php – erstellt den Termin im Google-Kalender und lädt beide Seiten ein.
   Erwartet POST (JSON): { name, email, company, func, message, start, website, t }
   "website" = Honeypot (muss leer sein), "t" = Ladezeitpunkt des Formulars (ms).
   Antwort:  { ok:true, start, htmlLink, meet } | { ok:false, error }
   ─────────────────────────────────────────────────────────────────────────── */

require __DIR__ . '/google.php';
g_cors();

/* ── Eingabe-Bereinigung ───────────────────────────────────────────────────── */

/* Einzeiliger Text: Steuerzeichen/Zeilenumbrüche raus, Länge begrenzen. */
function clean_line($v, $max) {
  $v = is_string($v) ? $v : '';
  $v = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v);
  $v = trim(preg_replace('/\s+/u', ' ', $v));
  return mb_substr($v, 0, $max);
}
/* Mehrzeiliger Text: nur \n erlaubt, Länge begrenzen. */
function clean_text($v, $max) {
  $v = is_string($v) ? $v : '';
  $v = str_replace(["\r\n", "\r"], "\n", $v);
  $v = preg_replace('/[^\P{C}\n]+/u', '', $v);
  return mb_substr(trim($v), 0, $max);
}
/* Wert für einen Mail-Header: nie Zeilenumbrüche, Sonderzeichen RFC-2047-kodiert. */
function hdr($v) {
  $v = preg_replace('/[\r\n\x00-\x1F\x7F]/', '', (string)$v);
  return preg_match('/[^\x20-\x7E]/', $v) ? '=?UTF-8?B?' . base64_encode($v) . '?=' : $v;
}
function json_fail($code, $err) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $err]);
  exit;
}

/* ── Fallback-Helfer ───────────────────────────────────────────────────────── */

/* Schickt die Anfrage per E-Mail an Reto, falls die Kalendereintragung scheitert. */
function send_mail_fallback($c, $d) {
  $to = $c['notify_email'] ?? '';
  if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
  try {
    $dt = new DateTime($d['start']); $dt->setTimezone(new DateTimeZone($c['timezone']));
    $when = $dt->format('d.m.Y, H:i') . ' Uhr';
  } catch (Exception $e) { $when = $d['start']; }
  $subject = 'Neue Terminanfrage – ' . $d['name'];
  $body = implode("\n", [
    'Neue Terminanfrage über das Website-Kontaktformular.',
    isset($d['_note']) ? ("\n" . $d['_note'] . "\n") : '',
    'Wunschtermin: ' . $when . '  (Dauer ' . $c['slot_minutes'] . ' Min.)',
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
  $headers = [
    'From: Website <' . $from . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  // Reply-To: Name RFC-2047-kodiert, Adresse zuvor validiert (kein CR/LF möglich).
  if (filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
    $headers[] = 'Reply-To: ' . hdr($d['name']) . ' <' . $d['email'] . '>';
  }
  return @mail($to, hdr($subject), $body, implode("\r\n", $headers));
}

/* Optionaler zusätzlicher Webhook-POST – nur an in config.php erlaubte HTTPS-Hosts. */
function post_webhook($c, $d) {
  $url = $c['webhook_url'] ?? '';
  if (!$url) return;
  $p = parse_url($url);
  $host = strtolower($p['host'] ?? '');
  $allowed = array_map('strtolower', $c['webhook_hosts'] ?? []);
  if (($p['scheme'] ?? '') !== 'https' || $host === '' || !in_array($host, $allowed, true)) return;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($d), CURLOPT_TIMEOUT => 8,
    CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
  ]);
  @curl_exec($ch); curl_close($ch);
}

/* Sendet Fallback (E-Mail + optional Webhook) und beendet mit passender Antwort. */
function respond_fallback($c, $d) {
  if (!isset($d['_note'])) {
    $d['_note'] = 'Hinweis: Automatische Kalendereintragung war nicht möglich – bitte den Termin manuell bestätigen.';
  }
  $sent = send_mail_fallback($c, $d);
  post_webhook($c, $d);
  if ($sent || !empty($c['webhook_url'])) {
    echo json_encode(['ok' => true, 'fallback' => true, 'start' => $d['start']]);
  } else {
    json_fail(502, 'no_channel');
  }
  exit;
}

/* ── Rate-Limit pro IP (eine Datei mit Sperre, kein Kollisionsrisiko) ──────── */
function rate_check($c, $ip, $commit) {
  $file = g_data_dir() . '/ratelimit.json';
  $max = (int)($c['rate_limit_per_hour'] ?? 5);
  $key = hash('sha256', $ip);
  $fh = @fopen($file, 'c+');
  if (!$fh) return true; // Speicher nicht verfügbar → Buchung nicht blockieren
  flock($fh, LOCK_EX);
  $raw = stream_get_contents($fh);
  $all = json_decode($raw ?: '{}', true) ?: [];
  $now = time();
  // alte Einträge (> 1 h) verwerfen
  foreach ($all as $k => $ts) { $all[$k] = array_values(array_filter((array)$ts, fn($t) => $t > $now - 3600)); if (!$all[$k]) unset($all[$k]); }
  $ok = count($all[$key] ?? []) < $max;
  if ($ok && $commit) { $all[$key][] = $now; }
  if ($commit || $raw !== json_encode($all)) { ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($all)); }
  flock($fh, LOCK_UN); fclose($fh);
  return $ok;
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

$c   = g_config();
$raw = file_get_contents('php://input', false, null, 0, 16384); // max. 16 KB
$in  = json_decode($raw ?: '', true);
if (!is_array($in)) json_fail(400, 'invalid');

// Honeypot 1: verstecktes Feld ausgefüllt → still „erfolgreich" abweisen
if (!empty($in['website'])) { echo json_encode(['ok' => true]); exit; }
// Honeypot 2: Formular in unter 3 s abgeschickt (nur wenn der Client ein t liefert)
if (isset($in['t']) && is_numeric($in['t'])) {
  $age = round(microtime(true) * 1000) - (float)$in['t'];
  if ($age >= 0 && $age < 3000) { echo json_encode(['ok' => true]); exit; }
}

$name    = clean_line($in['name'] ?? '', 120);
$email   = clean_line($in['email'] ?? '', 200);
$start   = clean_line($in['start'] ?? '', 40);
$company = clean_line($in['company'] ?? '', 160);
$func    = clean_line($in['func'] ?? '', 80);
$msg     = clean_text($in['message'] ?? '', 4000);

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $start === '') json_fail(400, 'invalid');

// Rate-Limit prüfen (zählen erst nach erfolgreicher Verarbeitung)
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
if (!rate_check($c, $ip, false)) json_fail(429, 'rate');

// Startzeit: striktes ISO-8601-Format, Zukunft, Arbeitstag/-zeit, Raster
$tz = new DateTimeZone($c['timezone']);
if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})$/', $start)) json_fail(400, 'time');
try { $startDt = new DateTime($start); } catch (Exception $e) { json_fail(400, 'time'); }
$startDt->setTimezone($tz);
$now = new DateTime('now', $tz);
$minStart = (clone $now)->modify('+' . (int)$c['min_notice_h'] . ' hours');
$maxStart = (clone $now)->modify('+' . ((int)$c['lookahead_days'] + 1) . ' days');
if ($startDt < $minStart || $startDt > $maxStart) json_fail(400, 'time');
if (!in_array((int)$startDt->format('N'), $c['work_days'], true)) json_fail(400, 'time');
list($wsH, $wsM) = array_map('intval', explode(':', $c['work_start']));
list($weH, $weM) = array_map('intval', explode(':', $c['work_end']));
$minOfDay = (int)$startDt->format('G') * 60 + (int)$startDt->format('i');
if ((int)$startDt->format('s') !== 0 || ($minOfDay - ($wsH * 60 + $wsM)) % (int)$c['step_minutes'] !== 0) json_fail(400, 'time');
if ($minOfDay < $wsH * 60 + $wsM || $minOfDay + (int)$c['slot_minutes'] > $weH * 60 + $weM) json_fail(400, 'time');
$endDt = (clone $startDt)->modify('+' . (int)$c['slot_minutes'] . ' minutes');

// Daten für Kalender ODER E-Mail-Fallback
$payload = [
  'name' => $name, 'email' => $email, 'company' => $company,
  'func' => $func, 'message' => $msg, 'start' => $startDt->format('c'),
];

$token = g_access_token();
if (!$token) { rate_check($c, $ip, true); respond_fallback($c, $payload); }

// Letzter Kollisions-Check direkt vor dem Anlegen
list($fc, $fb) = g_api('POST', 'https://www.googleapis.com/calendar/v3/freeBusy', $token, [
  'timeMin'  => (clone $startDt)->modify('-' . (int)$c['buffer_minutes'] . ' minutes')->format('c'),
  'timeMax'  => (clone $endDt)->modify('+' . (int)$c['buffer_minutes'] . ' minutes')->format('c'),
  'timeZone' => $c['timezone'],
  'items'    => [['id' => $c['calendar_id']]],
]);
$busy = $fb['calendars'][$c['calendar_id']]['busy'] ?? [];
if ($fc < 200 || $fc >= 300) { rate_check($c, $ip, true); respond_fallback($c, $payload); }
if (!empty($busy)) json_fail(409, 'taken');

// Termin-Beschreibung
$desc = "Anfrage über das Website-Kontaktformular.\n";
if ($company) $desc .= "Unternehmen: $company\n";
if ($func)    $desc .= "Funktion: $func\n";
if ($msg)     $desc .= "Anliegen: $msg\n";

$event = [
  'summary'     => $c['event_title'] . ' – ' . $name,
  'description' => $desc,
  'start'       => ['dateTime' => $startDt->format('c'), 'timeZone' => $c['timezone']],
  'end'         => ['dateTime' => $endDt->format('c'),   'timeZone' => $c['timezone']],
  'attendees'   => [['email' => $email, 'displayName' => $name]],
  'reminders'   => ['useDefault' => true],
];

$url = 'https://www.googleapis.com/calendar/v3/calendars/'
     . rawurlencode($c['calendar_id']) . '/events?sendUpdates=all';

if (!empty($c['add_meet_link'])) {
  $url .= '&conferenceDataVersion=1';
  $event['conferenceData'] = [
    'createRequest' => [
      'requestId' => uniqid('vp', true),
      'conferenceSolutionKey' => ['type' => 'hangoutsMeet'],
    ],
  ];
}

list($code, $ev) = g_api('POST', $url, $token, $event);
rate_check($c, $ip, true);
if ($code < 200 || $code >= 300) { respond_fallback($c, $payload); }

if (!empty($c['notify_on_success'])) {
  $payload['_note'] = 'Wurde automatisch im Kalender eingetragen (Kopie).';
  send_mail_fallback($c, $payload);
}

echo json_encode([
  'ok'       => true,
  'start'    => $startDt->format('c'),
  'htmlLink' => $ev['htmlLink'] ?? null,
  'meet'     => $ev['hangoutLink'] ?? null,
]);
