-- A reset sends a match back to upcoming and clears its games. Game numbers up to game_base
-- were cleared, so a late report for one of them is ignored and the next game gets a new number.
ALTER TABLE matches ADD COLUMN game_base integer NOT NULL DEFAULT 0 CHECK (game_base >= 0);
