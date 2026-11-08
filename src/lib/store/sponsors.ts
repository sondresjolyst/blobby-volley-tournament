// The sponsor library and the sponsors of each event. A library sponsor holds the name, link, logo
// and colour, and an event uses it at a position, shown or hidden. Logos are checked and the game
// logo is made before anything is stored.
import type { Pool, PoolClient } from 'pg';
import type { GameBoard, SponsorInput } from '@/lib/sponsors/input';
import type { CheckedLogo, LogoType } from '@/lib/sponsors/logo';
import { inTransaction } from './transaction';

/** The most sponsors one event can have. The game shows at most this many. */
export const MAX_SPONSORS = 32;

/** A sponsor at an event. The id is the place at the event, libraryId the sponsor in the library. */
export interface SponsorRow {
    id: number;
    eventId: number;
    libraryId: number;
    name: string;
    link: string | null;
    position: number;
    enabled: boolean;
    /** The own game background of the sponsor, or null to keep the game logo transparent. */
    gameBackground: string | null;
    logoType: LogoType;
    logoWidth: number;
    logoHeight: number;
    /** SHA-256 of the uploaded logo in hex. It changes with the logo, so it can bust caches. */
    logoHash: string;
    gameLogoHash: string;
}

interface SponsorRecord {
    id: number;
    event_id: number;
    library_id: number;
    name: string;
    link: string | null;
    position: number;
    enabled: boolean;
    game_background: string | null;
    logo_type: LogoType;
    logo_width: number;
    logo_height: number;
    logo_hash: string;
    game_logo_hash: string;
}

// The logos themselves are left out. Only the routes that serve them read them.
const COLUMNS =
    's.id, s.event_id, s.library_id, l.name, l.link, s.position, s.enabled, l.game_background, l.logo_type, l.logo_width, l.logo_height, l.logo_hash, l.game_logo_hash';
const FROM = 'sponsors s JOIN sponsor_library l ON l.id = s.library_id';

function toSponsor(row: SponsorRecord): SponsorRow {
    return {
        id: row.id,
        eventId: row.event_id,
        libraryId: row.library_id,
        name: row.name,
        link: row.link,
        position: row.position,
        enabled: row.enabled,
        gameBackground: row.game_background,
        logoType: row.logo_type,
        logoWidth: row.logo_width,
        logoHeight: row.logo_height,
        logoHash: row.logo_hash,
        gameLogoHash: row.game_logo_hash,
    };
}

/** Every sponsor of an event in the order they are shown, the disabled ones too. */
export async function listSponsors(pool: Pool, eventId: number): Promise<SponsorRow[]> {
    const { rows } = await pool.query<SponsorRecord>(`SELECT ${COLUMNS} FROM ${FROM} WHERE s.event_id = $1 ORDER BY s.position, s.id`, [eventId]);
    return rows.map(toSponsor);
}

/** The enabled sponsors of the active event in the order they are shown. Empty when no event is active. */
export async function listShownSponsors(pool: Pool): Promise<SponsorRow[]> {
    const { rows } = await pool.query<SponsorRecord>(`SELECT ${COLUMNS} FROM ${FROM} WHERE s.enabled AND s.event_id = (SELECT id FROM events WHERE is_active) ORDER BY s.position, s.id`);
    return rows.map(toSponsor);
}

export interface ServerSponsor {
    sponsorId: number;
    name: string;
    gameLogo: Uint8Array;
    gameLogoHash: string;
}

/**
 * The board style and the enabled sponsors of the active event with their game logos, for the
 * game server. The list is empty when the board is off.
 */
export async function listServerSponsors(pool: Pool): Promise<{ eventId: number | null; gameBoard: GameBoard; sponsors: ServerSponsor[] }> {
    // One query, so the event, the board and the sponsors agree.
    const { rows } = await pool.query<{ event_id: number; game_board: GameBoard; id: number | null; name: string | null; game_logo: Buffer | null; game_logo_hash: string | null }>(
        `SELECT e.id AS event_id, e.game_board, s.id, l.name, l.game_logo, l.game_logo_hash
         FROM events e LEFT JOIN (sponsors s JOIN sponsor_library l ON l.id = s.library_id) ON s.event_id = e.id AND s.enabled AND e.game_board <> 'off'
         WHERE e.is_active
         ORDER BY s.position, s.id`,
    );
    if (rows.length === 0) return { eventId: null, gameBoard: 'off', sponsors: [] };
    return {
        eventId: rows[0].event_id,
        gameBoard: rows[0].game_board,
        sponsors: rows.filter((r) => r.id !== null).map((r) => ({ sponsorId: r.id!, name: r.name!, gameLogo: r.game_logo!, gameLogoHash: r.game_logo_hash! })),
    };
}

/** Makes a game logo from a logo and an own background. The route passes makeGameLogo, so this file does not load the image library. */
export type GameLogoMaker = (logo: CheckedLogo, background: string | null) => Promise<Uint8Array>;

/**
 * Makes again, from the stored logos, the game logos that are still 24-bit BMPs from before the
 * alpha channel. Byte 28 of a BMP is its bits per pixel. Each logo is made in its own short
 * transaction, so no lock is held for the whole list. A row locked by another caller is skipped,
 * since that caller makes it, and a row that was saved with alpha meanwhile is left as it is.
 * Library sponsors in `skip` are left out. A logo that fails stays as it is. Returns how many were
 * made again and the ids that failed.
 */
export async function upgradeGameLogos(pool: Pool, make: GameLogoMaker, skip: readonly number[] = []): Promise<{ made: number; failed: number[] }> {
    const { rows: todo } = await pool.query<{ id: number }>('SELECT id FROM sponsor_library WHERE get_byte(game_logo, 28) <> 32 AND NOT (id = ANY($1::int[])) ORDER BY id', [skip]);
    let made = 0;
    const failed: number[] = [];
    for (const { id } of todo) {
        const result = await inTransaction(pool, async (client): Promise<'made' | 'failed' | 'skipped'> => {
            const { rows } = await client.query<{ logo: Buffer; logo_type: LogoType; logo_width: number; logo_height: number; game_background: string | null }>(
                `SELECT logo, logo_type, logo_width, logo_height, game_background FROM sponsor_library
                 WHERE id = $1 AND get_byte(game_logo, 28) <> 32 FOR UPDATE SKIP LOCKED`,
                [id],
            );
            const row = rows[0];
            if (!row) return 'skipped';
            let gameLogo: Uint8Array;
            try {
                gameLogo = await make({ bytes: new Uint8Array(row.logo), type: row.logo_type, width: row.logo_width, height: row.logo_height }, row.game_background);
            } catch {
                return 'failed';
            }
            await client.query('UPDATE sponsor_library SET game_logo = $2 WHERE id = $1', [id, Buffer.from(gameLogo)]);
            return 'made';
        });
        if (result === 'made') made++;
        if (result === 'failed') failed.push(id);
    }
    return { made, failed };
}

/** A logo that fails this many times is left as it is until the site restarts. */
export const LOGO_UPGRADE_TRIES = 3;

export interface LogoUpgradeState {
    done: boolean;
    /** Failed tries per library sponsor id. */
    failures: Map<number, number>;
    running: Promise<void> | null;
}

export const newLogoUpgradeState = (): LogoUpgradeState => ({ done: false, failures: new Map(), running: null });

const processUpgrade = newLogoUpgradeState();

/**
 * Runs upgradeGameLogos until nothing is left to make, and then never again in this process. Every
 * new logo is stored with alpha, so nothing old can come back. Calls at the same time share one
 * run. A logo that fails LOGO_UPGRADE_TRIES times is given up with a log line.
 */
export async function upgradeGameLogosOnce(pool: Pool, make: GameLogoMaker, state: LogoUpgradeState = processUpgrade): Promise<void> {
    if (state.done) return;
    state.running ??= (async () => {
        try {
            const given = [...state.failures].filter(([, tries]) => tries >= LOGO_UPGRADE_TRIES).map(([id]) => id);
            const { failed } = await upgradeGameLogos(pool, make, given);
            for (const id of failed) {
                const tries = (state.failures.get(id) ?? 0) + 1;
                state.failures.set(id, tries);
                if (tries === LOGO_UPGRADE_TRIES) console.warn(`The game logo of library sponsor ${id} could not be made again after ${tries} tries. It stays as it is.`);
            }
            if (failed.every((id) => (state.failures.get(id) ?? 0) >= LOGO_UPGRADE_TRIES)) state.done = true;
        } finally {
            state.running = null;
        }
    })();
    await state.running;
}

export interface StoredLogo extends CheckedLogo {
    hash: string;
    eventId: number;
    enabled: boolean;
    eventActive: boolean;
}

/** The uploaded logo of a sponsor at an event and whether it is shown, or null when there is no such sponsor. */
export async function getSponsorLogo(pool: Pool, id: number): Promise<StoredLogo | null> {
    const { rows } = await pool.query<{ logo: Buffer; logo_type: LogoType; logo_hash: string; logo_width: number; logo_height: number; event_id: number; enabled: boolean; is_active: boolean }>(
        `SELECT l.logo, l.logo_type, l.logo_hash, l.logo_width, l.logo_height, s.event_id, s.enabled, e.is_active
         FROM ${FROM} JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
        [id],
    );
    const row = rows[0];
    if (!row) return null;
    return { bytes: row.logo, type: row.logo_type, hash: row.logo_hash, width: row.logo_width, height: row.logo_height, eventId: row.event_id, enabled: row.enabled, eventActive: row.is_active };
}

/**
 * Locks the event, so sponsors of one event are added and moved one at a time. NO KEY UPDATE
 * still lets players sign up to the event meanwhile. Returns false when there is no such event.
 */
async function lockEvent(client: PoolClient, eventId: number): Promise<boolean> {
    const { rowCount } = await client.query('SELECT 1 FROM events WHERE id = $1 FOR NO KEY UPDATE', [eventId]);
    return rowCount === 1;
}

export type CreateSponsorResult = { ok: true; id: number } | { ok: false; error: 'not-found' | 'limit' | 'taken' | 'library-limit' };

/**
 * Puts a library sponsor at the end of the list of the event. The event must be locked. Refuses a
 * full event and a sponsor the event already has.
 */
async function placeSponsor(client: PoolClient, eventId: number, libraryId: number, enabled: boolean): Promise<CreateSponsorResult> {
    const { rows } = await client.query<{ count: number; last: number; taken: boolean }>(
        'SELECT count(*)::int AS count, coalesce(max(position), 0) AS last, coalesce(bool_or(library_id = $2), false) AS taken FROM sponsors WHERE event_id = $1',
        [eventId, libraryId],
    );
    if (rows[0].taken) return { ok: false, error: 'taken' };
    if (rows[0].count >= MAX_SPONSORS) return { ok: false, error: 'limit' };
    const inserted = await client.query<{ id: number }>('INSERT INTO sponsors (event_id, library_id, position, enabled) VALUES ($1, $2, $3, $4) RETURNING id', [
        eventId,
        libraryId,
        rows[0].last + 1,
        enabled,
    ]);
    return { ok: true, id: inserted.rows[0].id };
}

/** The most sponsors the library can hold. Sponsors moved in by the migration may be more, but no new one is added then. */
export const MAX_LIBRARY_SPONSORS = 500;

// Any number works, as long as only the library adds use it.
const LIBRARY_ADD_LOCK = 7_310_417;

/**
 * Adds a sponsor to the library, the one way every add path takes. Adds wait for each other until
 * the transaction ends, so the limit holds. Saves and reads of the library do not wait.
 */
async function insertLibrarySponsor(client: PoolClient, input: SponsorInput, logo: CheckedLogo, gameLogo: Uint8Array): Promise<{ ok: true; id: number } | { ok: false; error: 'library-limit' }> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LIBRARY_ADD_LOCK]);
    const { rows: count } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM sponsor_library');
    if (count[0].count >= MAX_LIBRARY_SPONSORS) return { ok: false, error: 'library-limit' };
    const { rows } = await client.query<{ id: number }>(
        `INSERT INTO sponsor_library (name, link, logo, logo_type, logo_width, logo_height, game_background, game_logo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [input.name, input.link, Buffer.from(logo.bytes), logo.type, logo.width, logo.height, input.gameBackground, Buffer.from(gameLogo)],
    );
    return { ok: true, id: rows[0].id };
}

/** Adds a new sponsor to the library and at the end of the list of the event, in one go. */
export async function createSponsor(pool: Pool, eventId: number, input: SponsorInput, logo: CheckedLogo, gameLogo: Uint8Array): Promise<CreateSponsorResult> {
    return inTransaction(pool, async (client): Promise<CreateSponsorResult> => {
        if (!(await lockEvent(client, eventId))) return { ok: false, error: 'not-found' };
        const { rows } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM sponsors WHERE event_id = $1', [eventId]);
        if (rows[0].count >= MAX_SPONSORS) return { ok: false, error: 'limit' };
        const added = await insertLibrarySponsor(client, input, logo, gameLogo);
        if (!added.ok) return added;
        return placeSponsor(client, eventId, added.id, input.enabled);
    });
}

/** Puts a sponsor from the library at the end of the list of the event, shown. */
export async function addFromLibrary(pool: Pool, eventId: number, libraryId: number): Promise<CreateSponsorResult> {
    return inTransaction(pool, async (client): Promise<CreateSponsorResult> => {
        if (!(await lockEvent(client, eventId))) return { ok: false, error: 'not-found' };
        // A share lock, so the library sponsor is not deleted before the event has it.
        const found = await client.query('SELECT 1 FROM sponsor_library WHERE id = $1 FOR KEY SHARE', [libraryId]);
        if (found.rowCount !== 1) return { ok: false, error: 'not-found' };
        return placeSponsor(client, eventId, libraryId, true);
    });
}

export type SaveResult = 'saved' | 'not-found' | 'logo-image';

/**
 * Saves the library columns of a sponsor. The row is locked first, so two saves at once never mix
 * a logo with the game logo of another. The game logo is made from the new logo, or else from the
 * locked stored one, since a new background colour changes it too.
 */
async function saveLibraryRow(client: PoolClient, libraryId: number, input: SponsorInput, logo: CheckedLogo | null, make: GameLogoMaker): Promise<SaveResult> {
    const { rows } = await client.query<{ logo: Buffer; logo_type: LogoType; logo_width: number; logo_height: number }>(
        'SELECT logo, logo_type, logo_width, logo_height FROM sponsor_library WHERE id = $1 FOR UPDATE',
        [libraryId],
    );
    const stored = rows[0];
    if (!stored) return 'not-found';
    let gameLogo: Uint8Array;
    try {
        gameLogo = await make(logo ?? { bytes: new Uint8Array(stored.logo), type: stored.logo_type, width: stored.logo_width, height: stored.logo_height }, input.gameBackground);
    } catch {
        return 'logo-image';
    }
    await client.query(
        `UPDATE sponsor_library SET name = $2, link = $3, game_background = $4, game_logo = $5,
             logo = coalesce($6, logo), logo_type = coalesce($7, logo_type), logo_width = coalesce($8, logo_width), logo_height = coalesce($9, logo_height),
             updated_at = now()
         WHERE id = $1`,
        [libraryId, input.name, input.link, input.gameBackground, Buffer.from(gameLogo), logo ? Buffer.from(logo.bytes) : null, logo?.type ?? null, logo?.width ?? null, logo?.height ?? null],
    );
    return 'saved';
}

/** The event of a sponsor at an event, or null when there is no such sponsor. */
export async function getSponsorEventId(pool: Pool, id: number): Promise<number | null> {
    const { rows } = await pool.query<{ event_id: number }>('SELECT event_id FROM sponsors WHERE id = $1', [id]);
    return rows[0]?.event_id ?? null;
}

/**
 * Changes a sponsor at an event. The name, link, logo and colour change in the library, so every
 * event with this sponsor shows the change. Shown is for this event only. Nothing changes when
 * the logo cannot be made into a game logo.
 */
export async function updateSponsor(pool: Pool, id: number, input: SponsorInput, logo: CheckedLogo | null, make: GameLogoMaker): Promise<SaveResult> {
    return inTransaction(pool, async (client): Promise<SaveResult> => {
        const { rows } = await client.query<{ library_id: number }>('SELECT library_id FROM sponsors WHERE id = $1 FOR UPDATE', [id]);
        if (!rows[0]) return 'not-found';
        const saved = await saveLibraryRow(client, rows[0].library_id, input, logo, make);
        if (saved !== 'saved') return saved;
        await client.query('UPDATE sponsors SET enabled = $2, updated_at = now() WHERE id = $1', [id, input.enabled]);
        return 'saved';
    });
}

/**
 * Turns a sponsor on or off at its event. Only that changes. The library and other events are not
 * touched. Returns the event id, or null when there is no such sponsor.
 */
export async function setSponsorShown(pool: Pool, id: number, enabled: boolean): Promise<number | null> {
    const { rows } = await pool.query<{ event_id: number }>('UPDATE sponsors SET enabled = $2, updated_at = now() WHERE id = $1 RETURNING event_id', [id, enabled]);
    return rows[0]?.event_id ?? null;
}

/**
 * Swaps a sponsor with the one before or after it. Moving the first one up or the last one down
 * changes nothing. Returns the event id, or null when there is no such sponsor.
 */
export async function moveSponsor(pool: Pool, id: number, direction: 'up' | 'down'): Promise<number | null> {
    return inTransaction(pool, async (client) => {
        const owner = await client.query<{ event_id: number }>('SELECT event_id FROM sponsors WHERE id = $1', [id]);
        const eventId = owner.rows[0]?.event_id;
        if (eventId === undefined || !(await lockEvent(client, eventId))) return null;
        // Read again after the lock, since another move may have changed the positions.
        const { rows } = await client.query<{ id: number; position: number }>('SELECT id, position FROM sponsors WHERE event_id = $1 ORDER BY position, id', [eventId]);
        const at = rows.findIndex((row) => row.id === id);
        if (at === -1) return null;
        const other = rows[direction === 'up' ? at - 1 : at + 1];
        if (!other) return eventId;
        await client.query('UPDATE sponsors SET position = CASE WHEN id = $1 THEN $2::int ELSE $3::int END, updated_at = now() WHERE id IN ($1, $4)', [id, other.position, rows[at].position, other.id]);
        return eventId;
    });
}

/**
 * Takes a sponsor off an event. The sponsor stays in the library. Returns the event id, or null
 * when there is no such sponsor.
 */
export async function deleteSponsor(pool: Pool, id: number): Promise<number | null> {
    const { rows } = await pool.query<{ event_id: number }>('DELETE FROM sponsors WHERE id = $1 RETURNING event_id', [id]);
    return rows[0]?.event_id ?? null;
}

export interface LibrarySponsor {
    id: number;
    name: string;
    link: string | null;
    gameBackground: string | null;
    logoWidth: number;
    logoHeight: number;
    logoHash: string;
    /** The events that use the sponsor, by name, the newest first. */
    events: { id: number; name: string }[];
}

/** Every sponsor in the library by name, with the events that use it. */
export async function listLibrary(pool: Pool): Promise<LibrarySponsor[]> {
    const { rows } = await pool.query<{
        id: number;
        name: string;
        link: string | null;
        game_background: string | null;
        logo_width: number;
        logo_height: number;
        logo_hash: string;
        events: { id: number; name: string }[];
    }>(
        `SELECT l.id, l.name, l.link, l.game_background, l.logo_width, l.logo_height, l.logo_hash,
                coalesce(json_agg(json_build_object('id', e.id, 'name', e.name) ORDER BY e.starts_on DESC, e.id DESC) FILTER (WHERE e.id IS NOT NULL), '[]') AS events
         FROM sponsor_library l LEFT JOIN sponsors s ON s.library_id = l.id LEFT JOIN events e ON e.id = s.event_id
         GROUP BY l.id ORDER BY lower(l.name), l.id`,
    );
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        link: row.link,
        gameBackground: row.game_background,
        logoWidth: row.logo_width,
        logoHeight: row.logo_height,
        logoHash: row.logo_hash,
        events: row.events,
    }));
}

export type CreateLibraryResult = { ok: true; id: number } | { ok: false; error: 'library-limit' };

/** Adds a sponsor to the library only. */
export async function createLibrarySponsor(pool: Pool, input: SponsorInput, logo: CheckedLogo, gameLogo: Uint8Array): Promise<CreateLibraryResult> {
    return inTransaction(pool, (client) => insertLibrarySponsor(client, input, logo, gameLogo));
}

/** Changes a sponsor in the library, for every event that uses it. */
export async function updateLibrarySponsor(pool: Pool, id: number, input: SponsorInput, logo: CheckedLogo | null, make: GameLogoMaker): Promise<SaveResult> {
    return inTransaction(pool, (client) => saveLibraryRow(client, id, input, logo, make));
}

/** How many sponsors the library holds. */
export async function countLibrary(pool: Pool): Promise<number> {
    const { rows } = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM sponsor_library');
    return rows[0].count;
}

/** Deletes a sponsor from the library. An event that uses it keeps it, and the delete is refused. */
export async function deleteLibrarySponsor(pool: Pool, id: number): Promise<'deleted' | 'in-use' | 'not-found'> {
    try {
        const { rowCount } = await pool.query('DELETE FROM sponsor_library WHERE id = $1', [id]);
        return rowCount === 1 ? 'deleted' : 'not-found';
    } catch (error) {
        // 23503 is a foreign key violation: an event still uses the sponsor.
        if ((error as { code?: string }).code === '23503') return 'in-use';
        throw error;
    }
}

/** The stored logo of a library sponsor, or null when there is no such sponsor. */
export async function getLibraryLogo(pool: Pool, id: number): Promise<(CheckedLogo & { hash: string }) | null> {
    const { rows } = await pool.query<{ logo: Buffer; logo_type: LogoType; logo_hash: string; logo_width: number; logo_height: number }>(
        'SELECT logo, logo_type, logo_hash, logo_width, logo_height FROM sponsor_library WHERE id = $1',
        [id],
    );
    const row = rows[0];
    if (!row) return null;
    return { bytes: row.logo, type: row.logo_type, hash: row.logo_hash, width: row.logo_width, height: row.logo_height };
}
