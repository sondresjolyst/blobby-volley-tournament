-- The pause in seconds between two games of a series, which the game shows as a countdown. Each
-- tournament has its own. A 1v1 match uses the default of 10.
ALTER TABLE tournaments
    ADD COLUMN next_game_delay integer NOT NULL DEFAULT 10 CHECK (next_game_delay BETWEEN 3 AND 120);
