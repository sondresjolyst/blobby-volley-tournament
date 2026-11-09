-- The 1v1 screen of the big screen: the 1v1 matches on the floor, the latest 1v1 results and the
-- next tournament matches. The list of screens an event may use takes it too.
ALTER TABLE events DROP CONSTRAINT events_big_screen_screens_check;
ALTER TABLE events ADD CONSTRAINT events_big_screen_screens_check
    CHECK (cardinality(big_screen_screens) BETWEEN 1 AND 8
        AND big_screen_screens <@ ARRAY['overview', 'bracket', 'foza', 'next', 'duels', 'stats', 'sponsors', 'winner']::text[]);
