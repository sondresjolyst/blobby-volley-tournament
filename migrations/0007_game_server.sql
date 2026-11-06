-- The address of the game server at the LAN. Join links are built from it. Both are set or both are empty.
ALTER TABLE events
    ADD COLUMN server_host text CHECK (server_host ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
    ADD COLUMN server_port integer CHECK (server_port BETWEEN 1 AND 65535),
    ADD CONSTRAINT events_server_both CHECK ((server_host IS NULL) = (server_port IS NULL));

-- The secret code a player joins the game server with. The game sends it in its player name field,
-- so it is 10 characters from an alphabet without 0, O, 1, I and L. It is unique per event.
ALTER TABLE players
    ADD COLUMN join_code text CHECK (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$'),
    ADD CONSTRAINT players_event_id_join_code_key UNIQUE (event_id, join_code);

-- Players who signed up before this migration get a code here. New players get one at sign-up.
-- gen_random_uuid uses the strong random source of the server. Bytes 6 and 8 hold the version
-- and variant bits, so they are skipped. Bytes from 248 up are skipped too, so each character
-- is equally likely.
DO $$
DECLARE
    alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    player record;
    code text;
    bytes bytea;
    b integer;
BEGIN
    FOR player IN SELECT id, event_id FROM players WHERE join_code IS NULL ORDER BY id LOOP
        LOOP
            code := '';
            WHILE length(code) < 10 LOOP
                bytes := uuid_send(gen_random_uuid());
                FOR i IN 0..15 LOOP
                    CONTINUE WHEN i IN (6, 8);
                    b := get_byte(bytes, i);
                    CONTINUE WHEN b >= 248;
                    code := code || substr(alphabet, b % 31 + 1, 1);
                    EXIT WHEN length(code) = 10;
                END LOOP;
            END LOOP;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM players WHERE event_id = player.event_id AND join_code = code);
        END LOOP;
        UPDATE players SET join_code = code WHERE id = player.id;
    END LOOP;
END;
$$;

ALTER TABLE players ALTER COLUMN join_code SET NOT NULL;

-- The first to this many points wins a game, and the game runs at this many frames per second.
-- A tournament match copies them from its tournament when the bracket is saved.
ALTER TABLE tournaments
    ADD COLUMN score_to_win integer NOT NULL DEFAULT 15 CHECK (score_to_win BETWEEN 1 AND 99),
    ADD COLUMN game_speed integer NOT NULL DEFAULT 75 CHECK (game_speed BETWEEN 30 AND 120);

ALTER TABLE matches
    ADD COLUMN score_to_win integer NOT NULL DEFAULT 15 CHECK (score_to_win BETWEEN 1 AND 99),
    ADD COLUMN game_speed integer NOT NULL DEFAULT 75 CHECK (game_speed BETWEEN 30 AND 120);

-- When the game server says a reported game started and ended. Null for reports sent before this.
ALTER TABLE game_reports
    ADD COLUMN started_at timestamptz,
    ADD COLUMN ended_at timestamptz;

-- The score of the game being played, for the big screen. The game server sends it while a game
-- runs. It is only shown and never changes a result.
CREATE TABLE live_scores (
    match_id integer PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
    game_number integer NOT NULL CHECK (game_number >= 1),
    points1 integer NOT NULL CHECK (points1 BETWEEN 0 AND 1000),
    points2 integer NOT NULL CHECK (points2 BETWEEN 0 AND 1000),
    updated_at timestamptz NOT NULL DEFAULT now()
);
