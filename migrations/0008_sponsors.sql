-- The sponsors of an event, shown in the site footer and in the game. The site checks each logo
-- before it is stored. The game gets a small 24-bit BMP made from the logo.
CREATE TABLE sponsors (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id integer NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
    -- An http or https address the footer links to.
    link text CHECK (link IS NULL OR (length(link) <= 500 AND link ~ '^https?://')),
    -- Sponsors are shown by position, the lowest first. Two sponsors of one event never share a
    -- position. The check waits until commit, so a move can swap two positions.
    position integer NOT NULL CHECK (position >= 1),
    enabled boolean NOT NULL DEFAULT true,
    -- The uploaded logo, as it came. Only PNG, JPEG and WebP are stored. SVG can hold scripts.
    logo bytea NOT NULL CHECK (octet_length(logo) BETWEEN 1 AND 1048576),
    logo_type text NOT NULL CHECK (logo_type IN ('image/png', 'image/jpeg', 'image/webp')),
    logo_width integer NOT NULL CHECK (logo_width BETWEEN 1 AND 2000),
    logo_height integer NOT NULL CHECK (logo_height BETWEEN 1 AND 2000),
    logo_hash text NOT NULL GENERATED ALWAYS AS (encode(sha256(logo), 'hex')) STORED,
    -- The colour transparent parts of the logo get in the game, which has no transparency.
    game_background text NOT NULL DEFAULT '#ffffff' CHECK (game_background ~ '^#[0-9a-f]{6}$'),
    -- A 24-bit BMP 32 pixels high and at most 160 wide. 54 header bytes and 32 rows of 480 bytes at most.
    game_logo bytea NOT NULL CHECK (octet_length(game_logo) BETWEEN 54 AND 15414),
    game_logo_hash text NOT NULL GENERATED ALWAYS AS (encode(sha256(game_logo), 'hex')) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sponsors_event_id_position_key UNIQUE (event_id, position) DEFERRABLE INITIALLY DEFERRED
);
