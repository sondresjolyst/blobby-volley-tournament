-- An event holds several tournaments.
CREATE TABLE tournaments (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id integer NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    format text NOT NULL CHECK (format IN ('single_elimination', 'double_elimination')),
    seeding text NOT NULL CHECK (seeding IN ('random', 'manual', 'elo')),
    -- Set only for random seeding. The same seed and players give the same bracket again.
    random_seed integer CHECK (random_seed >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((seeding = 'random') = (random_seed IS NOT NULL)),
    UNIQUE (id, event_id)
);

CREATE INDEX tournaments_event_id_idx ON tournaments (event_id);

-- Lets tournament_players check that a player belongs to the event of the tournament.
ALTER TABLE players ADD CONSTRAINT players_id_event_id_key UNIQUE (id, event_id);

CREATE TABLE tournament_players (
    tournament_id integer NOT NULL,
    event_id integer NOT NULL,
    player_id integer NOT NULL,
    seed integer NOT NULL CHECK (seed BETWEEN 1 AND 32),
    PRIMARY KEY (tournament_id, player_id),
    UNIQUE (tournament_id, seed),
    FOREIGN KEY (tournament_id, event_id) REFERENCES tournaments (id, event_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id, event_id) REFERENCES players (id, event_id) ON DELETE RESTRICT
);

CREATE INDEX tournament_players_player_id_idx ON tournament_players (player_id);

-- A match has two player slots. A slot is empty until a player is placed or moves on into it.
-- The next match columns say where the winner and the loser go, and into which slot.
CREATE TABLE bracket_matches (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tournament_id integer NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    section text NOT NULL CHECK (section IN ('winners', 'losers', 'final')),
    round integer NOT NULL CHECK (round >= 1),
    position integer NOT NULL CHECK (position >= 1),
    best_of integer NOT NULL CHECK (best_of IN (1, 3, 5, 7)),
    rule_file text NOT NULL DEFAULT 'default.lua' CHECK (rule_file ~ '^[A-Za-z0-9_-]{1,60}\.lua$'),
    player1_id integer,
    player2_id integer,
    next_winner_match_id integer,
    next_winner_slot smallint CHECK (next_winner_slot IN (1, 2)),
    next_loser_match_id integer,
    next_loser_slot smallint CHECK (next_loser_slot IN (1, 2)),
    UNIQUE (tournament_id, section, round, position),
    UNIQUE (tournament_id, id),
    CHECK (player1_id IS DISTINCT FROM player2_id OR player1_id IS NULL),
    CHECK ((next_winner_match_id IS NULL) = (next_winner_slot IS NULL)),
    CHECK ((next_loser_match_id IS NULL) = (next_loser_slot IS NULL)),
    FOREIGN KEY (tournament_id, player1_id) REFERENCES tournament_players (tournament_id, player_id),
    FOREIGN KEY (tournament_id, player2_id) REFERENCES tournament_players (tournament_id, player_id),
    -- The next match is always in the same tournament.
    FOREIGN KEY (tournament_id, next_winner_match_id) REFERENCES bracket_matches (tournament_id, id),
    FOREIGN KEY (tournament_id, next_loser_match_id) REFERENCES bracket_matches (tournament_id, id)
);

-- One slot can only be fed by one match.
CREATE UNIQUE INDEX bracket_matches_next_winner_idx ON bracket_matches (next_winner_match_id, next_winner_slot) WHERE next_winner_match_id IS NOT NULL;
CREATE UNIQUE INDEX bracket_matches_next_loser_idx ON bracket_matches (next_loser_match_id, next_loser_slot) WHERE next_loser_match_id IS NOT NULL;
