-- When the player last gave a wrong PIN. Wrong PINs older than a day no longer count towards a lock.
ALTER TABLE players ADD COLUMN last_failed_pin_at timestamptz;

UPDATE players SET last_failed_pin_at = now() WHERE failed_pin_attempts > 0;
