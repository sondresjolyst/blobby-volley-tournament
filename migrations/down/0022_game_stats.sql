-- Turns 0022_game_stats.sql back. The migration runner does not read this folder. Run the whole file
-- by hand with psql. It is one transaction. It removes every stored game stat.
BEGIN;

ALTER TABLE training_matches DROP COLUMN stats;
DROP TABLE match_game_stats;
DELETE FROM schema_migrations WHERE name = '0022_game_stats.sql';

COMMIT;
