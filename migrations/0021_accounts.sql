-- A player account that lasts across LANs. It holds the nickname, the PIN and the PIN lock. The
-- players table stays the row of an account at one event, so matches, bets and Foza stay per event.
-- The deferred triggers on players fire at once here, so the table can be changed after the update.
SET CONSTRAINTS ALL IMMEDIATE;

CREATE TABLE accounts (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nickname text NOT NULL CHECK (octet_length(nickname) BETWEEN 1 AND 15 AND nickname = btrim(nickname)),
    -- The nickname in lower case. Two accounts can never have the same one.
    nickname_key text NOT NULL UNIQUE CHECK (octet_length(nickname_key) BETWEEN 1 AND 15),
    pin_hash bytea NOT NULL,
    pin_salt bytea NOT NULL,
    failed_pin_attempts integer NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
    locked_until timestamptz,
    lock_level integer NOT NULL DEFAULT 0 CHECK (lock_level >= 0),
    last_failed_pin_at timestamptz,
    -- When the player last changed the nickname. A new change has to wait a while.
    nickname_changed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Players with the same nickname, ignoring case, become one account. The player of the newest event
-- gives the nickname, the PIN and the PIN lock. The account is as old as the first of its players.
INSERT INTO accounts (nickname, nickname_key, pin_hash, pin_salt, failed_pin_attempts, locked_until, lock_level, last_failed_pin_at, created_at)
SELECT DISTINCT ON (p.nickname_key)
    p.nickname, p.nickname_key, p.pin_hash, p.pin_salt, p.failed_pin_attempts, p.locked_until, p.lock_level, p.last_failed_pin_at,
    min(p.created_at) OVER (PARTITION BY p.nickname_key)
FROM players p
JOIN events e ON e.id = p.event_id
ORDER BY p.nickname_key, e.starts_on DESC, e.id DESC;

-- The nickname on a player row is a copy of the nickname of its account, so every page shows the
-- current one, also for past events. These triggers keep the copy right.
CREATE FUNCTION players_account_nickname() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    SELECT a.nickname, a.nickname_key INTO NEW.nickname, NEW.nickname_key FROM accounts a WHERE a.id = NEW.account_id;
    RETURN NEW;
END;
$$;

CREATE FUNCTION accounts_nickname_to_players() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE players SET nickname = NEW.nickname, nickname_key = NEW.nickname_key WHERE account_id = NEW.id;
    RETURN NULL;
END;
$$;

ALTER TABLE players ADD COLUMN account_id integer REFERENCES accounts (id) ON DELETE RESTRICT;

CREATE TRIGGER players_account_nickname BEFORE INSERT OR UPDATE OF account_id, nickname, nickname_key ON players
    FOR EACH ROW EXECUTE FUNCTION players_account_nickname();
CREATE TRIGGER accounts_nickname_to_players AFTER UPDATE OF nickname, nickname_key ON accounts
    FOR EACH ROW WHEN (OLD.nickname IS DISTINCT FROM NEW.nickname OR OLD.nickname_key IS DISTINCT FROM NEW.nickname_key)
    EXECUTE FUNCTION accounts_nickname_to_players();

UPDATE players p SET account_id = a.id FROM accounts a WHERE a.nickname_key = p.nickname_key;

ALTER TABLE players ALTER COLUMN account_id SET NOT NULL;
-- An account has one player row per event.
ALTER TABLE players ADD CONSTRAINT players_event_id_account_id_key UNIQUE (event_id, account_id);
CREATE INDEX players_account_id_idx ON players (account_id);

-- The PIN and the lock now live on the account. The old columns on players are no longer read or
-- written. They stay for the down file and are dropped by a later migration.
ALTER TABLE players ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE players ALTER COLUMN pin_salt DROP NOT NULL;

-- A session belongs to the account. A session from before stays signed in only when its player gave
-- the PIN of the account, the player of the newest event. The others end, so those players sign in
-- again with the PIN of the account. player_id is no longer written and stays for the down file.
DELETE FROM player_sessions s
USING players p
WHERE p.id = s.player_id
  AND p.id <> (
      SELECT newest.id FROM players newest JOIN events e ON e.id = newest.event_id
      WHERE newest.nickname_key = p.nickname_key
      ORDER BY e.starts_on DESC, e.id DESC
      LIMIT 1
  );
ALTER TABLE player_sessions ADD COLUMN account_id integer REFERENCES accounts (id) ON DELETE CASCADE;
UPDATE player_sessions s SET account_id = p.account_id FROM players p WHERE p.id = s.player_id;
ALTER TABLE player_sessions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE player_sessions ALTER COLUMN player_id DROP NOT NULL;
CREATE INDEX player_sessions_account_id_idx ON player_sessions (account_id);
