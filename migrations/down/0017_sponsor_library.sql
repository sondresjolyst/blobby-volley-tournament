-- Turns 0017_sponsor_library.sql back. The migration runner does not read this folder. Run it by
-- hand in one transaction, then delete the row of 0017_sponsor_library.sql from schema_migrations.
-- Each sponsor of an event gets the name, link, logo and colour of its library sponsor again.
-- Library sponsors that no event uses are lost.
ALTER TABLE sponsors
    ADD COLUMN name text,
    ADD COLUMN link text,
    ADD COLUMN logo bytea,
    ADD COLUMN logo_type text,
    ADD COLUMN logo_width integer,
    ADD COLUMN logo_height integer,
    ADD COLUMN game_background text,
    ADD COLUMN game_logo bytea;

UPDATE sponsors s
SET name = l.name, link = l.link, logo = l.logo, logo_type = l.logo_type, logo_width = l.logo_width, logo_height = l.logo_height,
    game_background = l.game_background, game_logo = l.game_logo
FROM sponsor_library l WHERE l.id = s.library_id;

ALTER TABLE sponsors
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN logo SET NOT NULL,
    ALTER COLUMN logo_type SET NOT NULL,
    ALTER COLUMN logo_width SET NOT NULL,
    ALTER COLUMN logo_height SET NOT NULL,
    ALTER COLUMN game_logo SET NOT NULL,
    ADD CONSTRAINT sponsors_name_check CHECK (length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
    ADD CONSTRAINT sponsors_link_check CHECK (link IS NULL OR (length(link) <= 500 AND link ~ '^https?://')),
    ADD CONSTRAINT sponsors_logo_check CHECK (octet_length(logo) BETWEEN 1 AND 1048576),
    ADD CONSTRAINT sponsors_logo_type_check CHECK (logo_type IN ('image/png', 'image/jpeg', 'image/webp')),
    ADD CONSTRAINT sponsors_logo_width_check CHECK (logo_width BETWEEN 1 AND 2000),
    ADD CONSTRAINT sponsors_logo_height_check CHECK (logo_height BETWEEN 1 AND 2000),
    ADD CONSTRAINT sponsors_game_background_check CHECK (game_background IS NULL OR game_background ~ '^#[0-9a-f]{6}$'),
    ADD CONSTRAINT sponsors_game_logo_check CHECK (octet_length(game_logo) BETWEEN 54 AND 20602),
    ADD COLUMN logo_hash text NOT NULL GENERATED ALWAYS AS (encode(sha256(logo), 'hex')) STORED,
    ADD COLUMN game_logo_hash text NOT NULL GENERATED ALWAYS AS (encode(sha256(game_logo), 'hex')) STORED;

ALTER TABLE sponsors DROP COLUMN library_id;
DROP TABLE sponsor_library;
