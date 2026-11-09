-- Turns 0019_big_screen_duels.sql back. The migration runner does not read this folder. Run the whole
-- file by hand with psql. It is one transaction. The 1v1 screen is taken out of every rotation first,
-- and an event that only showed it gets the overview.
BEGIN;

UPDATE events SET big_screen_screens = array_remove(big_screen_screens, 'duels') WHERE 'duels' = ANY(big_screen_screens);
UPDATE events SET big_screen_screens = ARRAY['overview']::text[] WHERE cardinality(big_screen_screens) = 0;
ALTER TABLE events DROP CONSTRAINT events_big_screen_screens_check;
ALTER TABLE events ADD CONSTRAINT events_big_screen_screens_check
    CHECK (cardinality(big_screen_screens) BETWEEN 1 AND 7
        AND big_screen_screens <@ ARRAY['overview', 'bracket', 'foza', 'next', 'stats', 'sponsors', 'winner']::text[]);
DELETE FROM schema_migrations WHERE name = '0019_big_screen_duels.sql';

COMMIT;
