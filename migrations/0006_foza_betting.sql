-- A bet backs one player of a match. One player has at most one live bet per match. A raise adds
-- to the amount. The pool of a match is every bet on it that is not refunded.
-- status:
-- - open: placed, the match has no result yet.
-- - won: the backed player won. payout is what the bettor got from the pool.
-- - lost: the backed player lost.
-- - returned: the match was decided, but nobody backed the winner, so the stake came back.
-- - refunded: the match was cancelled, forfeited or reset, or its players changed. A new bet on the
--   match can be placed after a reset.
CREATE TABLE bets (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id integer NOT NULL REFERENCES matches (id) ON DELETE RESTRICT,
    player_id integer NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
    -- The player the bet backs. It may be the bettor, on either side of the bettor's own match.
    on_player_id integer NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
    amount integer NOT NULL CHECK (amount >= 1),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'returned', 'refunded')),
    payout integer NOT NULL DEFAULT 0 CHECK (payout >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    CHECK (status = 'won' OR payout = 0),
    CHECK ((status = 'open') = (settled_at IS NULL))
);

CREATE UNIQUE INDEX bets_one_live_per_player_idx ON bets (match_id, player_id) WHERE status <> 'refunded';
CREATE INDEX bets_player_id_idx ON bets (player_id);

-- Every change to a Foza balance is one row here. The balance on the player row is the sum of the
-- rows. A trigger keeps it so, and rows are never changed or removed.
-- type:
-- - starting: the starting Foza of the event at sign-up.
-- - daily: the daily Foza for one calendar day in Europe/Oslo time. day is that date.
-- - bet: the stake of a bet or a raise, taken from the balance.
-- - payout: what a won bet got from the pool.
-- - refund: a stake given back. Also used when nobody backed the winner.
-- - reversal: a correction or reset took back a payout or a returned stake.
-- - admin_adjustment: an admin changed the balance. reason says why.
CREATE TABLE foza_ledger (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id integer NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
    type text NOT NULL CHECK (type IN ('starting', 'daily', 'bet', 'payout', 'refund', 'reversal', 'admin_adjustment')),
    amount integer NOT NULL,
    bet_id integer REFERENCES bets (id) ON DELETE RESTRICT,
    match_id integer REFERENCES matches (id) ON DELETE RESTRICT,
    day date,
    reason text CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 200),
    -- The GitHub user id of the admin who made an adjustment.
    admin_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((type = 'daily') = (day IS NOT NULL)),
    CHECK ((type = 'admin_adjustment') = (reason IS NOT NULL)),
    CHECK (type = 'admin_adjustment' OR admin_id IS NULL),
    CHECK ((type IN ('bet', 'payout', 'refund', 'reversal')) = (bet_id IS NOT NULL)),
    CHECK ((bet_id IS NULL) = (match_id IS NULL)),
    CHECK (CASE type
        WHEN 'starting' THEN amount >= 0
        WHEN 'bet' THEN amount < 0
        WHEN 'reversal' THEN amount < 0
        WHEN 'admin_adjustment' THEN amount <> 0
        ELSE amount > 0
    END),
    -- The daily Foza is paid at most once per player and day. Other rows have no day.
    UNIQUE (player_id, day)
);

CREATE INDEX foza_ledger_bet_id_idx ON foza_ledger (bet_id);
CREATE INDEX foza_ledger_match_id_idx ON foza_ledger (match_id);

-- Balances from before this migration are the starting Foza, since nothing else changed them.
INSERT INTO foza_ledger (player_id, type, amount, created_at)
SELECT id, 'starting', foza_balance, created_at FROM players ORDER BY id;

-- A reversal can take a balance below 0, since the payout may be spent already. Every other row
-- that takes Foza away is refused when it would.
ALTER TABLE players DROP CONSTRAINT players_foza_balance_check;

-- Adds each new ledger row to the balance of its player.
CREATE FUNCTION foza_ledger_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    balance integer;
BEGIN
    UPDATE players SET foza_balance = foza_balance + NEW.amount WHERE id = NEW.player_id RETURNING foza_balance INTO balance;
    IF NEW.amount < 0 AND balance < 0 AND NEW.type <> 'reversal' THEN
        RAISE EXCEPTION 'The Foza balance of player % would go below 0.', NEW.player_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER foza_ledger_apply AFTER INSERT ON foza_ledger FOR EACH ROW EXECUTE FUNCTION foza_ledger_apply();

CREATE FUNCTION foza_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Foza ledger rows cannot be changed or removed.' USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER foza_ledger_append_only BEFORE UPDATE OR DELETE ON foza_ledger FOR EACH ROW EXECUTE FUNCTION foza_ledger_append_only();

-- Checks at commit that a changed balance equals the sum of the ledger. It reads the row as it is
-- then, since several ledger rows can change one player in a transaction.
CREATE FUNCTION players_balance_matches_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    balance integer;
    total bigint;
BEGIN
    SELECT foza_balance INTO balance FROM players WHERE id = NEW.id;
    SELECT coalesce(sum(amount), 0) INTO total FROM foza_ledger WHERE player_id = NEW.id;
    IF balance IS DISTINCT FROM total THEN
        RAISE EXCEPTION 'The Foza balance of player % is %, but the ledger sums to %.', NEW.id, balance, total USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER players_balance_matches_ledger AFTER INSERT OR UPDATE OF foza_balance ON players
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION players_balance_matches_ledger();
