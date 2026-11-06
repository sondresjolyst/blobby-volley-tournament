-- The style of the sponsor board in the game for each event. The game shows no board when it is off.
ALTER TABLE events
    ADD COLUMN game_board text NOT NULL DEFAULT 'off' CHECK (game_board IN ('off', 'led', 'printed', 'wood', 'slim', 'padded'));

-- Game logos are now 32-bit BMPs with alpha, so the board shows through transparent parts. The
-- game background of a sponsor is an own colour the admin may set, and then the logo is opaque.
-- White was the default before, so it becomes null and the logo keeps its transparency.
ALTER TABLE sponsors
    ALTER COLUMN game_background DROP NOT NULL,
    ALTER COLUMN game_background DROP DEFAULT;
UPDATE sponsors SET game_background = NULL WHERE game_background = '#ffffff';

-- 122 header bytes and 32 rows of at most 160 pixels of 4 bytes. The game logos stored before are
-- 24-bit and smaller. The site makes them again from the stored logos the first time the game
-- server asks for the sponsors, since only the site can decode the logos.
ALTER TABLE sponsors DROP CONSTRAINT sponsors_game_logo_check;
ALTER TABLE sponsors ADD CONSTRAINT sponsors_game_logo_check CHECK (octet_length(game_logo) BETWEEN 54 AND 20602);
