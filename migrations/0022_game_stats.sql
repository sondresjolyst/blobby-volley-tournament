-- The final stats of a game, as the game server reports them. One row per player slot. The rally
-- numbers are per game and repeat on both rows.
CREATE TABLE match_game_stats (
    match_id integer NOT NULL,
    game_number integer NOT NULL,
    slot smallint NOT NULL CHECK (slot IN (1, 2)),
    ball_steps bigint NOT NULL CHECK (ball_steps BETWEEN 0 AND 10000000),
    touches integer NOT NULL CHECK (touches BETWEEN 0 AND 10000000),
    errors integer NOT NULL CHECK (errors BETWEEN 0 AND 10000000),
    net_hits integer NOT NULL CHECK (net_hits BETWEEN 0 AND 10000000),
    rallies integer NOT NULL CHECK (rallies BETWEEN 0 AND 10000000),
    longest_rally integer NOT NULL CHECK (longest_rally BETWEEN 0 AND 10000000),
    rally_touches integer NOT NULL CHECK (rally_touches BETWEEN 0 AND 10000000),
    PRIMARY KEY (match_id, game_number, slot),
    FOREIGN KEY (match_id, game_number) REFERENCES match_games (match_id, number) ON DELETE CASCADE
);

-- The stats of a training game, as the validated block of the report.
ALTER TABLE training_matches ADD COLUMN stats jsonb;
