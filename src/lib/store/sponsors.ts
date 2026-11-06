// The sponsors of each event. Logos are checked and the game logo is made before anything is stored.
import type { Pool, PoolClient } from 'pg';
import type { SponsorInput } from '@/lib/sponsors/input';
import type { CheckedLogo, LogoType } from '@/lib/sponsors/logo';
import { inTransaction } from './transaction';

/** The most sponsors one event can have, so the game server list stays small. */
export const MAX_SPONSORS = 50;

export interface SponsorRow {
    id: number;
    eventId: number;
    name: string;
    link: string | null;
    position: number;
    enabled: boolean;
    gameBackground: string;
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
    name: string;
    link: string | null;
    position: number;
    enabled: boolean;
    game_background: string;
    logo_type: LogoType;
    logo_width: number;
    logo_height: number;
    logo_hash: string;
    game_logo_hash: string;
}

// The logos themselves are left out. Only the routes that serve them read them.
const COLUMNS = 'id, event_id, name, link, position, enabled, game_background, logo_type, logo_width, logo_height, logo_hash, game_logo_hash';

function toSponsor(row: SponsorRecord): SponsorRow {
    return {
        id: row.id,
        eventId: row.event_id,
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
    const { rows } = await pool.query<SponsorRecord>(`SELECT ${COLUMNS} FROM sponsors WHERE event_id = $1 ORDER BY position, id`, [eventId]);
    return rows.map(toSponsor);
}

/** The enabled sponsors of the active event in the order they are shown. Empty when no event is active. */
export async function listShownSponsors(pool: Pool): Promise<SponsorRow[]> {
    const { rows } = await pool.query<SponsorRecord>(`SELECT ${COLUMNS} FROM sponsors WHERE enabled AND event_id = (SELECT id FROM events WHERE is_active) ORDER BY position, id`);
    return rows.map(toSponsor);
}

export interface ServerSponsor {
    sponsorId: number;
    name: string;
    gameLogo: Uint8Array;
    gameLogoHash: string;
}

/** The enabled sponsors of the active event with their game logos, for the game server. */
export async function listServerSponsors(pool: Pool): Promise<{ eventId: number | null; sponsors: ServerSponsor[] }> {
    // One query, so the event and the sponsors agree.
    const { rows } = await pool.query<{ event_id: number; id: number | null; name: string | null; game_logo: Buffer | null; game_logo_hash: string | null }>(
        `SELECT e.id AS event_id, s.id, s.name, s.game_logo, s.game_logo_hash
         FROM events e LEFT JOIN sponsors s ON s.event_id = e.id AND s.enabled
         WHERE e.is_active
         ORDER BY s.position, s.id`,
    );
    if (rows.length === 0) return { eventId: null, sponsors: [] };
    return {
        eventId: rows[0].event_id,
        sponsors: rows.filter((r) => r.id !== null).map((r) => ({ sponsorId: r.id!, name: r.name!, gameLogo: r.game_logo!, gameLogoHash: r.game_logo_hash! })),
    };
}

export interface StoredLogo extends CheckedLogo {
    hash: string;
    eventId: number;
    enabled: boolean;
    eventActive: boolean;
}

/** The uploaded logo of a sponsor and whether it is shown, or null when there is no such sponsor. */
export async function getSponsorLogo(pool: Pool, id: number): Promise<StoredLogo | null> {
    const { rows } = await pool.query<{ logo: Buffer; logo_type: LogoType; logo_hash: string; logo_width: number; logo_height: number; event_id: number; enabled: boolean; is_active: boolean }>(
        `SELECT s.logo, s.logo_type, s.logo_hash, s.logo_width, s.logo_height, s.event_id, s.enabled, e.is_active
         FROM sponsors s JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
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

export type CreateSponsorResult = { ok: true; id: number } | { ok: false; error: 'not-found' | 'limit' };

/** Adds a sponsor at the end of the list of the event. */
export async function createSponsor(pool: Pool, eventId: number, input: SponsorInput, logo: CheckedLogo, gameLogo: Uint8Array): Promise<CreateSponsorResult> {
    return inTransaction(pool, async (client): Promise<CreateSponsorResult> => {
        if (!(await lockEvent(client, eventId))) return { ok: false, error: 'not-found' };
        const { rows } = await client.query<{ count: number; last: number }>('SELECT count(*)::int AS count, coalesce(max(position), 0) AS last FROM sponsors WHERE event_id = $1', [eventId]);
        if (rows[0].count >= MAX_SPONSORS) return { ok: false, error: 'limit' };
        const inserted = await client.query<{ id: number }>(
            `INSERT INTO sponsors (event_id, name, link, position, enabled, logo, logo_type, logo_width, logo_height, game_background, game_logo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [eventId, input.name, input.link, rows[0].last + 1, input.enabled, Buffer.from(logo.bytes), logo.type, logo.width, logo.height, input.gameBackground, Buffer.from(gameLogo)],
        );
        return { ok: true, id: inserted.rows[0].id };
    });
}

/**
 * Changes a sponsor. A new logo replaces the old one when it is given. The game logo is always
 * written, since a new background colour changes it too. Returns the event id, or null when there
 * is no such sponsor.
 */
export async function updateSponsor(pool: Pool, id: number, input: SponsorInput, logo: CheckedLogo | null, gameLogo: Uint8Array): Promise<number | null> {
    const { rows } = await pool.query<{ event_id: number }>(
        `UPDATE sponsors SET name = $2, link = $3, enabled = $4, game_background = $5, game_logo = $6,
             logo = coalesce($7, logo), logo_type = coalesce($8, logo_type), logo_width = coalesce($9, logo_width), logo_height = coalesce($10, logo_height),
             updated_at = now()
         WHERE id = $1 RETURNING event_id`,
        [id, input.name, input.link, input.enabled, input.gameBackground, Buffer.from(gameLogo), logo ? Buffer.from(logo.bytes) : null, logo?.type ?? null, logo?.width ?? null, logo?.height ?? null],
    );
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

/** Removes a sponsor and its logos. Returns the event id, or null when there is no such sponsor. */
export async function deleteSponsor(pool: Pool, id: number): Promise<number | null> {
    const { rows } = await pool.query<{ event_id: number }>('DELETE FROM sponsors WHERE id = $1 RETURNING event_id', [id]);
    return rows[0]?.event_id ?? null;
}
