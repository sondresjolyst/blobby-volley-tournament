-- The live stats of the game being played, as the game server sends them with the live score.
ALTER TABLE live_scores ADD COLUMN stats jsonb;

-- The live score and stats of a training game, kept on the row while it is started. The points
-- are the player and the bot, as the game server sends them.
ALTER TABLE training_matches ADD COLUMN live_game integer, ADD COLUMN live_points jsonb, ADD COLUMN live_stats jsonb, ADD COLUMN live_updated_at timestamptz;

-- A live write must not make the open pages load again. The trigger now fires on the columns
-- that are not live ones.
DROP TRIGGER training_matches_live_version ON training_matches;
CREATE CONSTRAINT TRIGGER training_matches_live_version AFTER INSERT OR UPDATE OF event_id, player_id, bot, difficulty, rule_file, score_to_win, game_speed, state, cancel_reason, report_id, player_points, bot_points, won, game_started_at, game_ended_at, created_at, started_at, finished_at, cancelled_at, stats OR DELETE ON training_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_live_version_bump();
