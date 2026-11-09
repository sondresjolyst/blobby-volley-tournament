-- A training match: one player against a bot that the game server runs itself. It is kept apart
-- from the matches table, so it never reaches Foza, bets, leaderboards, Elo, tournaments or the
-- big screen. Its id comes from the sequence of matches, so the game server, which knows both
-- kinds by id, never sees the same id twice. A training match is one game. Its result is stored
-- on the row and makes the training stats.
CREATE TABLE training_matches (
    id integer PRIMARY KEY DEFAULT nextval(pg_get_serial_sequence('matches', 'id')::regclass),
    event_id integer NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    player_id integer NOT NULL,
    -- The name of a bot script of the game, without .lua.
    bot text NOT NULL CHECK (bot ~ '^[A-Za-z0-9_-]{1,40}$'),
    -- 0 is the strongest bot and 25 the weakest, as in the options of the game.
    difficulty integer NOT NULL CHECK (difficulty BETWEEN 0 AND 25),
    rule_file text NOT NULL DEFAULT 'default.lua' CHECK (rule_file ~ '^[A-Za-z0-9_-]{1,60}\.lua$'),
    score_to_win integer NOT NULL CHECK (score_to_win BETWEEN 1 AND 99),
    game_speed integer NOT NULL CHECK (game_speed BETWEEN 30 AND 120),
    -- called until the player joins, started while the game runs.
    state text NOT NULL DEFAULT 'called' CHECK (state IN ('called', 'started', 'finished', 'cancelled')),
    -- player: the player stopped it. left: the player left the game. replaced: the player was called to a real match.
    cancel_reason text CHECK (cancel_reason IN ('player', 'left', 'replaced')),
    -- The result of the game, set when it finished.
    report_id text UNIQUE CHECK (length(report_id) BETWEEN 1 AND 100),
    player_points integer CHECK (player_points BETWEEN 0 AND 1000),
    bot_points integer CHECK (bot_points BETWEEN 0 AND 1000),
    won boolean,
    game_started_at timestamptz,
    game_ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    cancelled_at timestamptz,
    CHECK ((state = 'cancelled') = (cancel_reason IS NOT NULL)),
    CHECK ((state = 'finished') = (won IS NOT NULL)),
    CHECK ((won IS NULL) = (player_points IS NULL) AND (won IS NULL) = (bot_points IS NULL) AND (won IS NULL) = (game_ended_at IS NULL)),
    CHECK (won IS NULL OR won = (player_points > bot_points)),
    CHECK (game_ended_at IS NULL OR game_started_at IS NULL OR game_ended_at >= game_started_at),
    FOREIGN KEY (player_id, event_id) REFERENCES players (id, event_id) ON DELETE RESTRICT
);

CREATE INDEX training_matches_event_id_state_idx ON training_matches (event_id, state);

-- A player has one open training match at a time.
CREATE UNIQUE INDEX training_matches_one_open_idx ON training_matches (player_id) WHERE state IN ('called', 'started');

-- The open pages load again when a training match changes, like for the matches. It has its own
-- function, so the down file of 0018_live_version.sql still works on its own.
CREATE FUNCTION training_live_version_bump() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE events SET live_version = live_version + 1 WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER training_matches_live_version AFTER INSERT OR UPDATE OR DELETE ON training_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_live_version_bump();
