-- The token the game server sends to the site API. There is one for the whole site, since the game
-- server serves the active event. Only the SHA-256 hash of the token is stored. The site shows the
-- token once, when an admin makes it. A new token replaces this row, so the old one stops working at once.
CREATE TABLE game_server_token (
    -- Always true, so the table holds at most one row.
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    -- When the game server last called with the token. Written at most once a minute.
    last_used_at timestamptz
);
