-- Player 1 can take back a 1v1 match that player 2 has not answered yet. It is then cancelled as withdrawn.
ALTER TABLE matches
    DROP CONSTRAINT matches_cancel_reason_check,
    ADD CONSTRAINT matches_cancel_reason_check CHECK (cancel_reason IN ('admin', 'declined', 'withdrawn'));
