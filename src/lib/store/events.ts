import type { Pool } from 'pg';
import type { EventInput } from '@/lib/events/input';
import type { GameBoard } from '@/lib/sponsors/input';

export interface EventRow extends EventInput {
    id: number;
    isActive: boolean;
    /** The style of the sponsor board in the game. Off shows no board. */
    gameBoard: GameBoard;
}

interface EventRecord {
    id: number;
    name: string;
    starts_on: string;
    ends_on: string;
    code: string;
    starting_foza: number;
    daily_foza: number;
    is_active: boolean;
    server_host: string | null;
    server_port: number | null;
    game_board: GameBoard;
}

// Dates are read as text, so the time zone of the server cannot move them a day.
const COLUMNS = `id, name, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on,
    code, starting_foza, daily_foza, is_active, server_host, server_port, game_board`;

// Any number works, as long as only setActiveEvent uses it.
const ACTIVE_LOCK_ID = 7_310_403;

function toEvent(row: EventRecord): EventRow {
    return {
        id: row.id,
        name: row.name,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        code: row.code,
        startingFoza: row.starting_foza,
        dailyFoza: row.daily_foza,
        isActive: row.is_active,
        serverHost: row.server_host,
        serverPort: row.server_port,
        gameBoard: row.game_board,
    };
}

/** All events, the newest first. Past events stay in the list. */
export async function listEvents(pool: Pool): Promise<EventRow[]> {
    const { rows } = await pool.query<EventRecord>(`SELECT ${COLUMNS} FROM events ORDER BY starts_on DESC, id DESC`);
    return rows.map(toEvent);
}

export async function getEvent(pool: Pool, id: number): Promise<EventRow | null> {
    const { rows } = await pool.query<EventRecord>(`SELECT ${COLUMNS} FROM events WHERE id = $1`, [id]);
    return rows[0] ? toEvent(rows[0]) : null;
}

export async function getActiveEvent(pool: Pool): Promise<EventRow | null> {
    const { rows } = await pool.query<EventRecord>(`SELECT ${COLUMNS} FROM events WHERE is_active`);
    return rows[0] ? toEvent(rows[0]) : null;
}

export async function createEvent(pool: Pool, input: EventInput): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza, server_host, server_port)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [input.name, input.startsOn, input.endsOn, input.code, input.startingFoza, input.dailyFoza, input.serverHost ?? null, input.serverPort ?? null],
    );
    return rows[0].id;
}

/** Changes an event. Players keep the balance they got when they signed up. */
export async function updateEvent(pool: Pool, id: number, input: EventInput): Promise<boolean> {
    const { rowCount } = await pool.query(
        `UPDATE events SET name = $2, starts_on = $3, ends_on = $4, code = $5, starting_foza = $6, daily_foza = $7,
             server_host = $8, server_port = $9
         WHERE id = $1`,
        [id, input.name, input.startsOn, input.endsOn, input.code, input.startingFoza, input.dailyFoza, input.serverHost ?? null, input.serverPort ?? null],
    );
    return rowCount === 1;
}

/** Sets the style of the sponsor board in the game. Returns false when the event does not exist. */
export async function setGameBoard(pool: Pool, id: number, board: GameBoard): Promise<boolean> {
    const { rowCount } = await pool.query('UPDATE events SET game_board = $2 WHERE id = $1', [id, board]);
    return rowCount === 1;
}

// The big screen key is read on its own and never part of EventRow, so it cannot reach a page by accident.

/** The big screen key of an event, or null when the event does not exist. Only for admin pages and the big screen check. */
export async function getBigScreenKey(pool: Pool, id: number): Promise<string | null> {
    const { rows } = await pool.query<{ big_screen_key: string }>('SELECT big_screen_key FROM events WHERE id = $1', [id]);
    return rows[0]?.big_screen_key ?? null;
}

/** The big screen key of the active event, or null when no event is active. */
export async function getActiveBigScreenKey(pool: Pool): Promise<string | null> {
    const { rows } = await pool.query<{ big_screen_key: string }>('SELECT big_screen_key FROM events WHERE is_active');
    return rows[0]?.big_screen_key ?? null;
}

/** Gives an event a new big screen key, so the old address stops showing the join card. Returns false when the event does not exist. */
export async function rotateBigScreenKey(pool: Pool, id: number): Promise<boolean> {
    const { rowCount } = await pool.query('UPDATE events SET big_screen_key = DEFAULT WHERE id = $1', [id]);
    return rowCount === 1;
}

/** Makes one event the active one and every other event inactive. Returns false when the event does not exist. */
export async function setActiveEvent(pool: Pool, id: number): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        try {
            // Two admins pressing at once would otherwise both pass the first update and then collide.
            await client.query('SELECT pg_advisory_xact_lock($1)', [ACTIVE_LOCK_ID]);
            const exists = await client.query('SELECT 1 FROM events WHERE id = $1', [id]);
            if (exists.rowCount !== 1) {
                await client.query('ROLLBACK');
                return false;
            }
            await client.query('UPDATE events SET is_active = false WHERE is_active AND id <> $1', [id]);
            await client.query('UPDATE events SET is_active = true WHERE id = $1', [id]);
            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    } finally {
        client.release();
    }
}

/** Leaves no event active, which closes sign-up and sign-in. */
export async function clearActiveEvent(pool: Pool): Promise<void> {
    await pool.query('UPDATE events SET is_active = false WHERE is_active');
}
