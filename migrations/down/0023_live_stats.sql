-- Turns 0023_live_stats.sql back. The migration runner does not read this folder. Run the whole file
-- by hand with psql. It is one transaction. It removes every stored live stat.
BEGIN;

DROP TRIGGER training_matches_live_version ON training_matches;
CREATE CONSTRAINT TRIGGER training_matches_live_version AFTER INSERT OR UPDATE OR DELETE ON training_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_live_version_bump();
ALTER TABLE training_matches DROP COLUMN live_game, DROP COLUMN live_points, DROP COLUMN live_stats, DROP COLUMN live_updated_at;
ALTER TABLE live_scores DROP COLUMN stats;
DELETE FROM schema_migrations WHERE name = '0023_live_stats.sql';

COMMIT;
