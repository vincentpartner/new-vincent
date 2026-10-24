<?php
/* Auszug: neue bzw. für die Benachrichtigung relevante Einträge für kalender/config.php
   auf dem Server (api.vincent-partner.ch). Bestehende Werte (client_id, refresh_token,
   calendar_id, origins …) unverändert lassen – nur diese Schlüssel ergänzen/anpassen. */
return [
  // Erhalten bei JEDER Buchung eine Google-Kalendereinladung (zuverlässig, ohne PHP-mail()).
  // NICHT die Adresse des Kalenderinhabers (r.puma@vincent-partner.ch) eintragen –
  // der Organisator bekommt von Google keine Einladung. Stattdessen z. B. info@ oder Gmail.
  'notify_attendees'  => ['info@vincent-partner.ch'],

  // Zusätzlich Kopie per E-Mail (PHP mail()). Nur wirksam, wenn der SPF-Eintrag von
  // vincent-partner.ch den Hostpoint-Mailserver erlaubt; sonst verwirft Gmail die Mail.
  'notify_on_success' => true,
  'notify_email'      => 'r.puma@vincent-partner.ch',
  'from_email'        => 'website@vincent-partner.ch',
];
