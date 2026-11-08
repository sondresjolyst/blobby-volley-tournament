-- A counter per event that goes up with every change the player pages show. The open pages read it
-- often and load again when it moves. Each change bumps the row of its own event inside its own
-- transaction, so the row lock orders the bumps like the commits, and no change can hide behind
-- a later one. The bumps wait until commit, so the event row is the last lock a change takes and
-- two changes cannot wait on each other for it. Existing events start at 0.
ALTER TABLE events ADD COLUMN live_version bigint NOT NULL DEFAULT 0;

-- Bumps the event of the changed row. A row whose event cannot be found any more bumps nothing,
-- since the change that removed its match or player bumps the event itself.
CREATE FUNCTION live_version_bump() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    row_event integer;
BEGIN
    IF TG_TABLE_NAME = 'match_games' THEN
        SELECT event_id INTO row_event FROM matches WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.match_id ELSE NEW.match_id END;
    ELSIF TG_TABLE_NAME = 'foza_ledger' THEN
        SELECT event_id INTO row_event FROM players WHERE id = NEW.player_id;
    ELSIF TG_OP = 'DELETE' THEN
        row_event := OLD.event_id;
    ELSE
        row_event := NEW.event_id;
    END IF;
    UPDATE events SET live_version = live_version + 1 WHERE id = row_event;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER matches_live_version AFTER INSERT OR UPDATE OR DELETE ON matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION live_version_bump();
CREATE CONSTRAINT TRIGGER match_games_live_version AFTER INSERT OR UPDATE OR DELETE ON match_games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION live_version_bump();
CREATE CONSTRAINT TRIGGER players_live_version AFTER INSERT OR UPDATE OR DELETE ON players DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION live_version_bump();
CREATE CONSTRAINT TRIGGER tournaments_live_version AFTER INSERT OR UPDATE OR DELETE ON tournaments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION live_version_bump();
-- The ledger only grows. A trigger elsewhere refuses updates and deletes.
CREATE CONSTRAINT TRIGGER foza_ledger_live_version AFTER INSERT ON foza_ledger DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION live_version_bump();

-- A change to the event itself, such as its name or which event is active, bumps it too. A bump
-- from the triggers above already moved the counter, so it is not counted twice.
CREATE FUNCTION events_live_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.live_version = OLD.live_version THEN
        NEW.live_version := OLD.live_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER events_live_version BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION events_live_version();
