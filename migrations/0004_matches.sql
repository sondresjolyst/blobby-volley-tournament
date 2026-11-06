-- A match that can be played. Tournament matches and standalone 1v1 matches share this table,
-- so betting and the game server treat them the same. bracket_matches stays the source of the
-- bracket structure. A tournament match has one row here for its bracket match.
CREATE TABLE matches (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id integer NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    -- Both set for a tournament match, both null for a 1v1 match.
    tournament_id integer,
    bracket_match_id integer UNIQUE,
    state text NOT NULL DEFAULT 'upcoming' CHECK (state IN ('upcoming', 'called', 'started', 'finished', 'cancelled')),
    best_of integer NOT NULL CHECK (best_of IN (1, 3, 5, 7)),
    rule_file text NOT NULL DEFAULT 'default.lua' CHECK (rule_file ~ '^[A-Za-z0-9_-]{1,60}\.lua$'),
    -- A tournament match has the same players as its bracket match. A slot is empty until filled.
    -- In a 1v1 match player 1 asked and player 2 was asked.
    player1_id integer,
    player2_id integer,
    -- 1v1 only. Set when player 2 accepts. The match cannot be called before that.
    accepted_at timestamptz,
    -- The series score. It is worked out again from the games after every change.
    score1 integer NOT NULL DEFAULT 0 CHECK (score1 >= 0),
    score2 integer NOT NULL DEFAULT 0 CHECK (score2 >= 0),
    -- A series score the admin set by hand. It replaces the games up to and including manual_after_game.
    manual_score1 integer CHECK (manual_score1 >= 0),
    manual_score2 integer CHECK (manual_score2 >= 0),
    manual_after_game integer CHECK (manual_after_game >= 0),
    winner_id integer,
    -- How a finished match was decided: by the games, or by a no-show.
    result text CHECK (result IN ('played', 'forfeit')),
    -- Why a match was cancelled: by an admin, or player 2 declined a 1v1 match.
    cancel_reason text CHECK (cancel_reason IN ('admin', 'declined')),
    created_at timestamptz NOT NULL DEFAULT now(),
    called_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    cancelled_at timestamptz,
    CHECK ((tournament_id IS NULL) = (bracket_match_id IS NULL)),
    CHECK (tournament_id IS NULL OR accepted_at IS NULL),
    CHECK (player1_id IS DISTINCT FROM player2_id OR player1_id IS NULL),
    CHECK (tournament_id IS NOT NULL OR (player1_id IS NOT NULL AND player2_id IS NOT NULL)),
    CHECK ((manual_score1 IS NULL) = (manual_score2 IS NULL) AND (manual_score1 IS NULL) = (manual_after_game IS NULL)),
    CHECK ((state = 'finished') = (winner_id IS NOT NULL)),
    CHECK ((state = 'finished') = (result IS NOT NULL)),
    CHECK ((state = 'cancelled') = (cancel_reason IS NOT NULL)),
    CHECK (winner_id IS NULL OR winner_id = player1_id OR winner_id = player2_id),
    CHECK (state IN ('upcoming', 'cancelled') OR (player1_id IS NOT NULL AND player2_id IS NOT NULL)),
    CHECK (state IN ('upcoming', 'cancelled') OR tournament_id IS NOT NULL OR accepted_at IS NOT NULL),
    FOREIGN KEY (tournament_id, event_id) REFERENCES tournaments (id, event_id) ON DELETE CASCADE,
    FOREIGN KEY (tournament_id, bracket_match_id) REFERENCES bracket_matches (tournament_id, id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id, event_id) REFERENCES players (id, event_id) ON DELETE RESTRICT,
    FOREIGN KEY (player2_id, event_id) REFERENCES players (id, event_id) ON DELETE RESTRICT
);

CREATE INDEX matches_event_id_state_idx ON matches (event_id, state);
CREATE INDEX matches_tournament_id_idx ON matches (tournament_id);
CREATE INDEX matches_player1_id_idx ON matches (player1_id);
CREATE INDEX matches_player2_id_idx ON matches (player2_id);

-- Two players can have only one open 1v1 match with each other at a time.
CREATE UNIQUE INDEX matches_one_open_1v1_idx ON matches (least(player1_id, player2_id), greatest(player1_id, player2_id))
    WHERE tournament_id IS NULL AND state IN ('upcoming', 'called', 'started');

-- One game of a series. A game that ended without a winner, such as on a disconnect, is abandoned
-- and does not count. Number 1 is the first game played. A restarted game gets the next number.
CREATE TABLE match_games (
    match_id integer NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    number integer NOT NULL CHECK (number >= 1),
    status text NOT NULL CHECK (status IN ('finished', 'abandoned')),
    winner_slot smallint CHECK (winner_slot IN (1, 2)),
    -- The points in the game. Both 0 when unknown.
    points1 integer NOT NULL DEFAULT 0 CHECK (points1 >= 0),
    points2 integer NOT NULL DEFAULT 0 CHECK (points2 >= 0),
    -- Who stored the result last. A report from the game server never changes a game an admin set.
    -- An abandoned game from the server waits for the admin to restart or award it.
    source text NOT NULL CHECK (source IN ('server', 'admin')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, number),
    CHECK ((status = 'finished') = (winner_slot IS NOT NULL))
);

-- Every game result the game server sends, kept once by its report id. A report sent again is
-- found here and changes nothing.
CREATE TABLE game_reports (
    report_id text PRIMARY KEY CHECK (length(report_id) BETWEEN 1 AND 100),
    match_id integer NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    game_number integer NOT NULL,
    winner_slot smallint CHECK (winner_slot IN (1, 2)),
    points1 integer NOT NULL,
    points2 integer NOT NULL,
    -- applied: stored as the game result. ignored: not stored, see reason.
    outcome text NOT NULL CHECK (outcome IN ('applied', 'ignored')),
    reason text,
    received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX game_reports_match_id_idx ON game_reports (match_id);

-- The final places of a tournament decided so far. Written again whenever a result changes.
CREATE TABLE tournament_placings (
    tournament_id integer NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    player_id integer NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
    place integer NOT NULL CHECK (place >= 1),
    PRIMARY KEY (tournament_id, player_id)
);

-- Tournaments saved before this migration get a match row for each bracket match.
INSERT INTO matches (event_id, tournament_id, bracket_match_id, best_of, rule_file, player1_id, player2_id)
SELECT t.event_id, bm.tournament_id, bm.id, bm.best_of, bm.rule_file, bm.player1_id, bm.player2_id
FROM bracket_matches bm JOIN tournaments t ON t.id = bm.tournament_id
ORDER BY bm.id;
