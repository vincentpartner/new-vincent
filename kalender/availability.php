<?php
/* ───────────────────────────────────────────────────────────────────────────
   availability.php – freie 1,5-h-Slots aus dem Google-Kalender berechnen.
   Antwort:  { "ok": true, "collection": [ { "start_time": "...ISO...", "status": "available" } ] }
             { "ok": false, "error": "..." }   → Kalender nicht verlässlich abfragbar
   Leere collection bei ok:true = tatsächlich ausgebucht (kein Fehler).
   ─────────────────────────────────────────────────────────────────────────── */

require __DIR__ . '/google.php';
g_cors();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: Accept, Content-Type');
  http_response_code(204);
  exit;
}
g_require_trusted_request(false);

$c  = g_config();
$tz = new DateTimeZone($c['timezone']);
function avail_fail($code, $err) { http_response_code($code); echo json_encode(['ok' => false, 'collection' => [], 'error' => $err]); exit; }

// Rate-Limit pro IP (Verfügbarkeitsabfragen), fail-closed
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$rl = g_rate_take('avail', $ip, (int)($c['avail_limit_per_hour'] ?? 60));
if ($rl === null) avail_fail(503, 'storage');
if ($rl === false) avail_fail(429, 'rate');

// Kurzer serverseitiger Cache (schont Google-Kontingent; Buchung prüft ohnehin frisch)
$cacheFile = g_data_dir() . '/avail-cache.json';
$ttl = (int)($c['avail_cache_sec'] ?? 60);
if ($ttl > 0 && is_file($cacheFile)) {
  $cd = json_decode(@file_get_contents($cacheFile), true);
  if ($cd && ($cd['t'] ?? 0) > time() - $ttl && isset($cd['body'])) { echo $cd['body']; exit; }
}

$token = g_access_token();
if (!$token) avail_fail(502, 'auth');

$now     = new DateTime('now', $tz);
$timeMin = (clone $now)->modify('+' . (int)$c['min_notice_h'] . ' hours');
$timeMax = (clone $now)->modify('+' . (int)$c['lookahead_days'] . ' days');
$buf     = (int)$c['buffer_minutes'] * 60;

// Belegte Zeiten inkl. Puffer am Fensterrand abfragen
$fb = g_freebusy($token,
  (clone $timeMin)->modify('-' . (int)$c['buffer_minutes'] . ' minutes')->format('c'),
  (clone $timeMax)->modify('+' . (int)$c['buffer_minutes'] . ' minutes')->format('c'));
if (!$fb['ok']) avail_fail(502, 'freebusy_' . $fb['why']);

$busy = array_map(fn($b) => [$b[0] - $buf, $b[1] + $buf], $fb['busy']);

$slotSec = (int)$c['slot_minutes'] * 60;
$minTs   = $timeMin->getTimestamp();
$maxTs   = $timeMax->getTimestamp();

list($wsH, $wsM) = array_map('intval', explode(':', $c['work_start']));
list($weH, $weM) = array_map('intval', explode(':', $c['work_end']));

$out = [];
$day = (clone $timeMin)->setTime(0, 0, 0);
$lastDay = (clone $timeMax)->setTime(0, 0, 0);

while ($day <= $lastDay && count($out) < $c['max_slots']) {
  if (in_array((int)$day->format('N'), $c['work_days'], true)) {
    $dayStart = (clone $day)->setTime($wsH, $wsM);
    $dayEnd   = (clone $day)->setTime($weH, $weM);
    $perDay = 0;
    for ($t = clone $dayStart; $t->getTimestamp() + $slotSec <= $dayEnd->getTimestamp(); $t->modify('+' . (int)$c['step_minutes'] . ' minutes')) {
      $s = $t->getTimestamp(); $e = $s + $slotSec;
      if ($s < $minTs) continue;                  // Mindestvorlauf
      if ($e > $maxTs) break;                     // Slot muss vollständig im abgefragten Fenster liegen
      $free = true;
      foreach ($busy as $r) { if ($s < $r[1] && $e > $r[0]) { $free = false; break; } }
      if ($free) {
        $out[] = ['start_time' => (clone $t)->format('c'), 'status' => 'available'];
        if (++$perDay >= $c['max_per_day']) break;
        if (count($out) >= $c['max_slots']) break;
      }
    }
  }
  $day->modify('+1 day');
}

$body = json_encode(['ok' => true, 'collection' => $out]);
if ($ttl > 0) { $tmp = $cacheFile . '.' . getmypid() . '.tmp'; if (@file_put_contents($tmp, json_encode(['t' => time(), 'body' => $body])) !== false) { @rename($tmp, $cacheFile); } }
echo $body;
