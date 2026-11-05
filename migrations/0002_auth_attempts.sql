-- Counts failed sign-ins and wrong event codes per bucket and time window.
-- A bucket is a client address or an event.
CREATE TABLE auth_attempts (
    bucket text NOT NULL,
    window_start timestamptz NOT NULL,
    count integer NOT NULL,
    PRIMARY KEY (bucket, window_start)
);

CREATE INDEX auth_attempts_window_start_idx ON auth_attempts (window_start);

-- How many locks in a row the player has had without a right PIN in between. Each lock lasts longer.
ALTER TABLE players ADD COLUMN lock_level integer NOT NULL DEFAULT 0 CHECK (lock_level >= 0);
