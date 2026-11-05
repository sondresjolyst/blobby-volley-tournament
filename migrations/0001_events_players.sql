-- One event per LAN. Past events stay in the table.
CREATE TABLE events (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    code text NOT NULL CHECK (code ~ '^[A-Z0-9-]{4,32}$'),
    starting_foza integer NOT NULL CHECK (starting_foza >= 0),
    daily_foza integer NOT NULL CHECK (daily_foza >= 0),
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_on >= starts_on)
);

-- At most one row can have is_active set.
CREATE UNIQUE INDEX events_one_active_idx ON events (is_active) WHERE is_active;

-- A player belongs to one event. The same person at the next LAN is a new row.
CREATE TABLE players (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id integer NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    nickname text NOT NULL CHECK (octet_length(nickname) BETWEEN 1 AND 15 AND nickname = btrim(nickname)),
    -- The nickname in lower case. It keeps nicknames unique per event and can link players across events later.
    nickname_key text NOT NULL CHECK (octet_length(nickname_key) BETWEEN 1 AND 15),
    pin_hash bytea NOT NULL,
    pin_salt bytea NOT NULL,
    failed_pin_attempts integer NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
    locked_until timestamptz,
    foza_balance integer NOT NULL CHECK (foza_balance >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, nickname_key)
);

CREATE INDEX players_nickname_key_idx ON players (nickname_key);

-- Only a hash of the session token is stored.
CREATE TABLE player_sessions (
    token_hash bytea PRIMARY KEY,
    player_id integer NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX player_sessions_player_id_idx ON player_sessions (player_id);
