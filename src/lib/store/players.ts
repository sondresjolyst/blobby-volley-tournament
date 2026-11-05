import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { isLocked, lockDurationMs, MAX_WRONG_PINS } from '@/lib/players/lockout';
import { DUMMY_PIN_HASH, hashPin, verifyPin, type PinHash } from '@/lib/players/pin';
import { hashSessionToken, isSessionExpired, newSessionToken, sessionExpiresAt } from '@/lib/players/session';
import { claimAttempts, releaseAttempt } from './attempts';

const UNIQUE_VIOLATION = '23505';

/**
 * Failed sign-ins and wrong event codes allowed per client address in an hour. It is generous,
 * because everyone at a LAN can share one address.
 */
export const CLIENT_FAILURES_PER_HOUR = 100;
/** Failed sign-ins allowed per event in an hour, across all players. */
export const EVENT_FAILURES_PER_HOUR = 300;

export const eventBucket = (eventId: number) => `event:${eventId}`;

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

/** Compares two event codes. The SHA-256 digests have the same length, so the comparison takes the same time. */
export function eventCodesMatch(stored: string, given: string): boolean {
    const a = createHash('sha256').update(stored, 'utf8').digest();
    const b = createHash('sha256').update(given, 'utf8').digest();
    return timingSafeEqual(a, b);
}

export interface SignUpInput {
    code: string;
    nickname: string;
    nicknameKey: string;
    pin: string;
}

export type SignUpResult = { ok: true; playerId: number } | { ok: false; error: 'no-event' | 'code' | 'taken' | 'busy' };

/**
 * Adds a player to the active event when the code matches. The player starts with the event's
 * starting Foza. A wrong code counts against the client's limit. The PIN is only hashed after
 * the code is right.
 */
export async function signUpPlayer(pool: Pool, input: SignUpInput, client: string, now: Date): Promise<SignUpResult> {
    const active = await pool.query<{ id: number; code: string }>('SELECT id, code FROM events WHERE is_active');
    const event = active.rows[0];
    if (!event) return { ok: false, error: 'no-event' };
    if (!(await claimAttempts(pool, [{ bucket: client, limit: CLIENT_FAILURES_PER_HOUR }], now))) return { ok: false, error: 'busy' };
    if (!eventCodesMatch(event.code, input.code)) return { ok: false, error: 'code' };
    // A right code is not a failure.
    await releaseAttempt(pool, client, now);
    const pin = await hashPin(input.pin);
    try {
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance)
             SELECT id, $2, $3, $4, $5, starting_foza FROM events WHERE id = $1 AND is_active AND code = $6
             RETURNING id`,
            [event.id, input.nickname, input.nicknameKey, pin.hash, pin.salt, event.code],
        );
        // The event was changed between the two queries.
        if (!rows[0]) return { ok: false, error: 'code' };
        return { ok: true, playerId: rows[0].id };
    } catch (error) {
        if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return { ok: false, error: 'taken' };
        throw error;
    }
}

export type SignInResult =
    | { ok: true; playerId: number }
    | { ok: false; error: 'no-event' | 'wrong' | 'busy' }
    | { ok: false; error: 'locked'; until: Date | null };

interface ClaimRecord {
    id: number;
    pin_hash: Buffer;
    pin_salt: Buffer;
    lock_level: number;
}

/**
 * Checks a nickname and PIN for the active event.
 *
 * The attempt is claimed before the PIN is checked. The claim counts the attempt as wrong, and
 * only succeeds while the player is not locked and has fewer than 5 wrong PINs, so PINs sent at
 * the same time cannot get past the limit. The slow scrypt check runs with no database
 * connection held. A right PIN then clears the count and the lock level.
 *
 * Every attempt also counts against the client and the event. A right PIN gives those back.
 */
export async function signInPlayer(pool: Pool, nicknameKey: string, pin: string, client: string, now: Date): Promise<SignInResult> {
    const active = await pool.query<{ id: number }>('SELECT id FROM events WHERE is_active');
    const eventId = active.rows[0]?.id;
    if (eventId === undefined) return { ok: false, error: 'no-event' };
    const buckets = [
        { bucket: client, limit: CLIENT_FAILURES_PER_HOUR },
        { bucket: eventBucket(eventId), limit: EVENT_FAILURES_PER_HOUR },
    ];
    if (!(await claimAttempts(pool, buckets, now))) return { ok: false, error: 'busy' };
    const giveBack = async () => {
        for (const { bucket } of buckets) await releaseAttempt(pool, bucket, now);
    };

    const claim = await pool.query<ClaimRecord>(
        `UPDATE players SET failed_pin_attempts = failed_pin_attempts + 1
         WHERE event_id = $1 AND nickname_key = $2 AND failed_pin_attempts < $3 AND (locked_until IS NULL OR locked_until <= $4)
         RETURNING id, pin_hash, pin_salt, lock_level`,
        [eventId, nicknameKey, MAX_WRONG_PINS, now],
    );
    const player = claim.rows[0];
    if (!player) {
        const existing = await pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM players WHERE event_id = $1 AND nickname_key = $2', [eventId, nicknameKey]);
        if (existing.rows[0]) {
            // The player is locked. This was not a guess, so it does not count.
            await giveBack();
            const until = existing.rows[0].locked_until;
            return { ok: false, error: 'locked', until: isLocked(until, now) ? until : null };
        }
        // Same work as a real check, so the time does not tell whether the nickname exists.
        await verifyPin(pin, DUMMY_PIN_HASH);
        return { ok: false, error: 'wrong' };
    }

    const correct = await verifyPin(pin, { hash: player.pin_hash, salt: player.pin_salt });
    if (correct) {
        await pool.query('UPDATE players SET failed_pin_attempts = 0, lock_level = 0, locked_until = NULL WHERE id = $1', [player.id]);
        await giveBack();
        return { ok: true, playerId: player.id };
    }

    // Lock once the count reaches the limit. Only one of several wrong PINs sent together sets the lock.
    const until = new Date(now.getTime() + lockDurationMs(player.lock_level));
    const locked = await pool.query<{ locked_until: Date }>(
        `UPDATE players SET locked_until = $3, lock_level = lock_level + 1, failed_pin_attempts = 0
         WHERE id = $1 AND lock_level = $2 AND failed_pin_attempts >= $4
         RETURNING locked_until`,
        [player.id, player.lock_level, until, MAX_WRONG_PINS],
    );
    if (locked.rows[0]) return { ok: false, error: 'locked', until: locked.rows[0].locked_until };
    return { ok: false, error: 'wrong' };
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
    eventActive: boolean;
}

/** The player of a session that has not expired, or null. The player's event may no longer be active. */
export async function getSessionPlayer(pool: Pool, token: string, now: Date): Promise<SessionPlayer | null> {
    const tokenHash = hashSessionToken(token);
    const { rows } = await pool.query<{ id: number; nickname: string; foza_balance: number; event_id: number; event_name: string; event_active: boolean; expires_at: Date }>(
        `SELECT p.id, p.nickname, p.foza_balance, e.id AS event_id, e.name AS event_name, e.is_active AS event_active, s.expires_at
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
    return { id: row.id, nickname: row.nickname, fozaBalance: row.foza_balance, eventId: row.event_id, eventName: row.event_name, eventActive: row.event_active };
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
            'UPDATE players SET pin_hash = $2, pin_salt = $3, failed_pin_attempts = 0, locked_until = NULL, lock_level = 0 WHERE id = $1 RETURNING event_id',
            [playerId, pin.hash, pin.salt],
        );
        if (!rows[0]) return null;
        await client.query('DELETE FROM player_sessions WHERE player_id = $1', [playerId]);
        return { eventId: rows[0].event_id };
    });
}
