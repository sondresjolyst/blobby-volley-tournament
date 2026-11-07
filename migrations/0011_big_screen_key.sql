-- A new big screen key. gen_random_uuid uses the strong random source of the server. Two UUIDs
-- give 32 bytes, 244 of them random, since each UUID holds 6 version and variant bits. They are
-- written as URL-safe base64 without padding, 43 characters.
CREATE FUNCTION new_big_screen_key() RETURNS text
    LANGUAGE sql VOLATILE
    AS $$ SELECT rtrim(translate(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '+/', '-_'), '=') $$;

-- The key that lets the big screen show the event code and the sign-up QR code, as /big?key=<key>.
-- Each event has its own. The default runs for each row, so every event from before gets its own
-- key here and every new event gets one when it is made. An admin can make a new one, which is the
-- default again.
ALTER TABLE events
    ADD COLUMN big_screen_key text NOT NULL DEFAULT new_big_screen_key() CHECK (big_screen_key ~ '^[A-Za-z0-9_-]{43}$'),
    ADD CONSTRAINT events_big_screen_key_key UNIQUE (big_screen_key);
