<?php
/* ───────────────────────────────────────────────────────────────────────────
   availability.php – freie 1,5-h-Slots aus dem Google-Kalender berechnen.
   Antwort:  { "collection": [ { "start_time": "...ISO...", "status": "available" } ] }
   (gleiche Form, die das Kontaktformular erwartet)
   ─────────────────────────────────────────────────────────────────────────── */

require __DIR__ . '/google.php';
g_cors();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: Accept, Content-Type');
  http_response_code(204);
  exit;
}

$c  = g_config();
$tz = new DateTimeZone($c['timezone']);

$token = g_access_token();
if (!$token) { echo json_encode(['collection' => [], 'error' => 'auth']); exit; }

$now     = new DateTime('now', $tz);
$timeMin = (clone $now)->modify('+' . $c['min_notice_h'] . ' hours');
$timeMax = (clone $now)->modify('+' . $c['lookahead_days'] . ' days');

// Belegte Zeiten holen
list($code, $fb) = g_api('POST', 'https://www.googleapis.com/calendar/v3/freeBusy', $token, [
  'timeMin'  => $timeMin->format('c'),
  'timeMax'  => $timeMax->format('c'),
  'timeZone' => $c['timezone'],
  'items'    => [['id' => $c['calendar_id']]],
]);
if ($code < 200 || $code >= 300) {
  echo json_encode(['collection' => [], 'error' => 'freebusy_' . $code]);
  exit;
}

$busyRaw = $fb['calendars'][$c['calendar_id']]['busy'] ?? [];
$buf = $c['buffer_minutes'] * 60;
$busy = array_map(function ($b) use ($buf) {
  return [strtotime($b['start']) - $buf, strtotime($b['end']) + $buf];
}, $busyRaw);

$slotSec = $c['slot_minutes'] * 60;
$minTs   = $timeMin->getTimestamp();

list($wsH, $wsM) = array_map('intval', explode(':', $c['work_start']));
list($weH, $weM) = array_map('intval', explode(':', $c['work_end']));

$out = [];
$day = (clone $timeMin)->setTime(0, 0, 0);
$lastDay = (clone $timeMax);

while ($day <= $lastDay && count($out) < $c['max_slots']) {
  $dow = (int)$day->format('N');
  if (in_array($dow, $c['work_days'], true)) {
    $dayStart = (clone $day)->setTime($wsH, $wsM);
    $dayEnd   = (clone $day)->setTime($weH, $weM);
    $perDay = 0;

    for (
      $t = clone $dayStart;
      $t->getTimestamp() + $slotSec <= $dayEnd->getTimestamp();
      $t->modify('+' . $c['step_minutes'] . ' minutes')
    ) {
      $s = $t->getTimestamp();
      $e = $s + $slotSec;
      if ($s < $minTs) continue;               // Mindestvorlauf

      $free = true;
      foreach ($busy as $r) {
        if ($s < $r[1] && $e > $r[0]) { $free = false; break; }
      }
      if ($free) {
        $out[] = ['start_time' => (clone $t)->format('c'), 'status' => 'available'];
        $perDay++;
        if ($perDay >= $c['max_per_day']) break;       // Tagespause für Vielfalt
        if (count($out) >= $c['max_slots']) break;
      }
    }
  }
  $day->modify('+1 day');
}

echo json_encode(['collection' => $out]);
