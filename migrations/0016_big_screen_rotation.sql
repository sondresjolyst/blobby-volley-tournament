-- The screens the big screen takes turns on, in order, and how many seconds each one stays up.
-- Each event has its own. The overview alone is the default, so a screen set up before this keeps
-- showing what it showed. One screen means no rotation.
ALTER TABLE events
    ADD COLUMN big_screen_screens text[] NOT NULL DEFAULT ARRAY['overview']::text[]
        CHECK (cardinality(big_screen_screens) BETWEEN 1 AND 7
            AND big_screen_screens <@ ARRAY['overview', 'bracket', 'foza', 'next', 'stats', 'sponsors', 'winner']::text[]),
    ADD COLUMN big_screen_seconds integer NOT NULL DEFAULT 60 CHECK (big_screen_seconds BETWEEN 10 AND 600);
