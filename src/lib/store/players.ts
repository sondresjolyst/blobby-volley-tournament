import type { Pool, PoolClient } from 'pg';
import { afterPinCheck, isLocked } from '@/lib/players/lockout';
import { DUMMY_PIN_HASH, verifyPin, type PinHash } from '@/lib/players/pin';
import { hashSessionToken, isSessionExpired, newSessionToken, sessionExpiresAt } from '@/lib/players/session';

const UNIQUE_VIOLATION = '23505';

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        try {
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    } finally {
        client.release();
    }
}

export interface SignUpInput {
    code: string;
    nickname: string;
    nicknameKey: string;
    pin: PinHash;
}

export type SignUpResult = { ok: true; playerId: number } | { ok: false; error: 'no-event' | 'code' | 'taken' };

/** Adds a player to the active event when the code matches. The player starts with the event's starting Foza. */
export async function signUpPlayer(pool: Pool, input: SignUpInput): Promise<SignUpResult> {
    const active = await pool.query<{ id: number; code: string }>('SELECT id, code FROM events WHERE is_active');
    const event = active.rows[0];
    if (!event) return { ok: false, error: 'no-event' };
    if (event.code !== input.code) return { ok: false, error: 'code' };
    try {
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance)
             SELECT id, $2, $3, $4, $5, starting_foza FROM events WHERE id = $1 AND is_active AND code = $6
             RETURNING id`,
            [event.id, input.nickname, input.nicknameKey, input.pin.hash, input.pin.salt, input.code],
        );
        // The event was changed between the two queries.
        if (!rows[0]) return { ok: false, error: 'code' };
        return { ok: true, playerId: rows[0].id };
    } catch (error) {
        if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return { ok: false, error: 'taken' };
        throw error;
    }
}

export type SignInResult = { ok: true; playerId: number } | { ok: false; error: 'no-event' | 'wrong' } | { ok: false; error: 'locked'; until: Date };

interface PinRecord {
    id: number;
    pin_hash: Buffer;
    pin_salt: Buffer;
    failed_pin_attempts: number;
    locked_until: Date | null;
}

/**
 * Checks a nickname and PIN for the active event. The player row stays locked during the check,
 * so wrong PINs sent at the same time are all counted. A locked player is not checked at all.
 */
export async function signInPlayer(pool: Pool, nicknameKey: string, pin: string, now: Date): Promise<SignInResult> {
    return inTransaction(pool, async (client) => {
        const active = await client.query<{ id: number }>('SELECT id FROM events WHERE is_active');
        if (!active.rows[0]) return { ok: false, error: 'no-event' } as const;
        const { rows } = await client.query<PinRecord>(
            `SELECT id, pin_hash, pin_salt, failed_pin_attempts, locked_until FROM players
             WHERE event_id = $1 AND nickname_key = $2 FOR UPDATE`,
            [active.rows[0].id, nicknameKey],
        );
        const player = rows[0];
        if (!player) {
            // Same work as a real check, so the time does not tell whether the nickname exists.
            await verifyPin(pin, DUMMY_PIN_HASH);
            return { ok: false, error: 'wrong' } as const;
        }
        const state = { failedAttempts: player.failed_pin_attempts, lockedUntil: player.locked_until };
        if (isLocked(state, now)) return { ok: false, error: 'locked', until: state.lockedUntil! } as const;
        const correct = await verifyPin(pin, { hash: player.pin_hash, salt: player.pin_salt });
        const next = afterPinCheck(state, correct, now);
        await client.query('UPDATE players SET failed_pin_attempts = $2, locked_until = $3 WHERE id = $1', [player.id, next.failedAttempts, next.lockedUntil]);
        if (correct) return { ok: true, playerId: player.id } as const;
        if (isLocked(next, now)) return { ok: false, error: 'locked', until: next.lockedUntil! } as const;
        return { ok: false, error: 'wrong' } as const;
    });
}

/** Starts a session and returns the token for the cookie. Only its hash is stored. */
export async function createSession(pool: Pool, playerId: number, now: Date): Promise<{ token: string; expiresAt: Date }> {
    const token = newSessionToken();
    const expiresAt = sessionExpiresAt(now);
    await pool.query('DELETE FROM player_sessions WHERE player_id = $1 AND expires_at <= $2', [playerId, now]);
    await pool.query('INSERT INTO player_sessions (token_hash, player_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
        hashSessionToken(token),
        playerId,
        now,
        expiresAt,
    ]);
    return { token, expiresAt };
}

export interface SessionPlayer {
    id: number;
    nickname: string;
    fozaBalance: number;
    eventId: number;
    eventName: string;
}

/** The player of a session that has not expired, or null. */
export async function getSessionPlayer(pool: Pool, token: string, now: Date): Promise<SessionPlayer | null> {
    const tokenHash = hashSessionToken(token);
    const { rows } = await pool.query<{ id: number; nickname: string; foza_balance: number; event_id: number; event_name: string; expires_at: Date }>(
        `SELECT p.id, p.nickname, p.foza_balance, e.id AS event_id, e.name AS event_name, s.expires_at
         FROM player_sessions s
         JOIN players p ON p.id = s.player_id
         JOIN events e ON e.id = p.event_id
         WHERE s.token_hash = $1`,
        [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    if (isSessionExpired(row.expires_at, now)) {
        await pool.query('DELETE FROM player_sessions WHERE token_hash = $1', [tokenHash]);
        return null;
    }
    return { id: row.id, nickname: row.nickname, fozaBalance: row.foza_balance, eventId: row.event_id, eventName: row.event_name };
}

export async function deleteSession(pool: Pool, token: string): Promise<void> {
    await pool.query('DELETE FROM player_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

export interface PlayerRow {
    id: number;
    nickname: string;
    fozaBalance: number;
    lockedUntil: Date | null;
    createdAt: Date;
}

export async function listPlayers(pool: Pool, eventId: number): Promise<PlayerRow[]> {
    const { rows } = await pool.query<{ id: number; nickname: string; foza_balance: number; locked_until: Date | null; created_at: Date }>(
        'SELECT id, nickname, foza_balance, locked_until, created_at FROM players WHERE event_id = $1 ORDER BY nickname_key',
        [eventId],
    );
    return rows.map((row) => ({ id: row.id, nickname: row.nickname, fozaBalance: row.foza_balance, lockedUntil: row.locked_until, createdAt: row.created_at }));
}

/** Gives a player a new PIN, lifts any lock and signs the player out on every device. */
export async function resetPlayerPin(pool: Pool, playerId: number, pin: PinHash): Promise<{ eventId: number } | null> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ event_id: number }>(
            'UPDATE players SET pin_hash = $2, pin_salt = $3, failed_pin_attempts = 0, locked_until = NULL WHERE id = $1 RETURNING event_id',
            [playerId, pin.hash, pin.salt],
        );
        if (!rows[0]) return null;
        await client.query('DELETE FROM player_sessions WHERE player_id = $1', [playerId]);
        return { eventId: rows[0].event_id };
    });
}
