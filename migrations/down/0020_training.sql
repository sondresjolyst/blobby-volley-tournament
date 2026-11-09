-- Turns 0020_training.sql back. The migration runner does not read this folder. Run the whole file
-- by hand with psql. It is one transaction. It removes every training match and the training stats.
BEGIN;

DROP TABLE training_matches;
DROP FUNCTION training_live_version_bump();
DELETE FROM schema_migrations WHERE name = '0020_training.sql';

COMMIT;
