-- The player who left an abandoned game, as the game server reports it. 1 or 2 is the slot of the
-- match. Null when the server did not say, or when the game has a winner. The admin page shows it,
-- so the admin can choose to restart the game or award it.
ALTER TABLE match_games
    ADD COLUMN left_slot smallint CHECK (left_slot IN (1, 2)),
    ADD CONSTRAINT match_games_left_slot_abandoned CHECK (left_slot IS NULL OR status = 'abandoned');

ALTER TABLE game_reports
    ADD COLUMN left_slot smallint CHECK (left_slot IN (1, 2)),
    ADD CONSTRAINT game_reports_left_slot_abandoned CHECK (left_slot IS NULL OR winner_slot IS NULL);
