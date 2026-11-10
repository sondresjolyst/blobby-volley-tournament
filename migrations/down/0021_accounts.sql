-- Turns 0021_accounts.sql back. The migration runner does not read this folder. Run the whole file
-- by hand with psql. It is one transaction. Every player row gets the PIN and the PIN lock of its
-- account, so a PIN reset after the migration still works, and the PINs that older player rows had
-- before the merge are gone. Each player row keeps the current nickname of its account, so the
-- spelling a player had at an older event before the merge or a change of nickname is not restored.
BEGIN;

SET CONSTRAINTS ALL IMMEDIATE;

DROP TRIGGER players_account_nickname ON players;
DROP TRIGGER accounts_nickname_to_players ON accounts;
DROP FUNCTION players_account_nickname();
DROP FUNCTION accounts_nickname_to_players();

UPDATE players p SET
    pin_hash = a.pin_hash,
    pin_salt = a.pin_salt,
    failed_pin_attempts = a.failed_pin_attempts,
    locked_until = a.locked_until,
    lock_level = a.lock_level,
    last_failed_pin_at = a.last_failed_pin_at
FROM accounts a
WHERE a.id = p.account_id;

ALTER TABLE players ALTER COLUMN pin_hash SET NOT NULL;
ALTER TABLE players ALTER COLUMN pin_salt SET NOT NULL;

-- A session made after the migration goes to the player row of the active event, or else of the
-- newest event, so nobody is signed out.
UPDATE player_sessions s SET player_id = (
    SELECT p.id FROM players p JOIN events e ON e.id = p.event_id
    WHERE p.account_id = s.account_id
    ORDER BY e.is_active DESC, e.starts_on DESC, e.id DESC
    LIMIT 1
)
WHERE s.player_id IS NULL;
DELETE FROM player_sessions WHERE player_id IS NULL;
ALTER TABLE player_sessions ALTER COLUMN player_id SET NOT NULL;
ALTER TABLE player_sessions DROP COLUMN account_id;

ALTER TABLE players DROP COLUMN account_id;
DROP TABLE accounts;
DELETE FROM schema_migrations WHERE name = '0021_accounts.sql';

COMMIT;
