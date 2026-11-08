-- Turns 0018_live_version.sql back. The migration runner does not read this folder. Run the whole
-- file by hand with psql. It is one transaction. The live version is only a counter, so nothing is
-- lost. The player pages then stop loading again by themselves until the migration runs again.
BEGIN;

DROP TRIGGER events_live_version ON events;
DROP TRIGGER foza_ledger_live_version ON foza_ledger;
DROP TRIGGER tournaments_live_version ON tournaments;
DROP TRIGGER players_live_version ON players;
DROP TRIGGER match_games_live_version ON match_games;
DROP TRIGGER matches_live_version ON matches;
DROP FUNCTION events_live_version();
DROP FUNCTION live_version_bump();
ALTER TABLE events DROP COLUMN live_version;
DELETE FROM schema_migrations WHERE name = '0018_live_version.sql';

COMMIT;
