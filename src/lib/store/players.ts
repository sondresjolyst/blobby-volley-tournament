import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { isLocked, lockDurationMs, MAX_WRONG_PINS } from '@/lib/players/lockout';
import { DUMMY_PIN_HASH, hashPin, verifyPin, type PinHash } from '@/lib/players/pin';
import { hashSessionToken, isSessionExpired, newSessionToken, sessionExpiresAt } from '@/lib/players/session';
import { claimAttempts, releaseAttempt } from './attempts';

const UNIQUE_VIOLATION = '23505';

/**
 * Unknown nicknames and wrong event codes allowed per client address in an hour. It is generous,
 * because everyone at a LAN can share one address. Wrong PINs on real players do not count here.
 */
export const CLIENT_FAILURES_PER_HOUR = 100;
/** Wrong PINs on real players allowed per event in an hour, across all players. */
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

export interface PinClaim {
    id: number;
    pinHash: PinHash;
    /** Set when this claim used the last try and locked the player. */
    lockedUntil: Date | null;
}

/**
 * Claims one PIN check for a player in one atomic statement. The claim counts as a wrong PIN
 * until a right PIN clears it. It only succeeds while the player is not locked and has fewer
 * than 5 wrong PINs. The claim that uses the fifth try also sets the lock, with an end time from
 * the lock level, and raises the level. So a crash after the claim can never leave a player
 * blocked without an end time. Returns null when the player is locked or does not exist.
 */
export async function claimPinAttempt(pool: Pool, eventId: number, nicknameKey: string, now: Date): Promise<PinClaim | null> {
    const steps = [0, 1, 2].map(lockDurationMs);
    const { rows } = await pool.query<{ id: number; pin_hash: Buffer; pin_salt: Buffer; locked_until: Date | null; just_locked: boolean }>(
        `UPDATE players SET
             failed_pin_attempts = CASE WHEN failed_pin_attempts + 1 >= $3 THEN 0 ELSE failed_pin_attempts + 1 END,
             locked_until = CASE WHEN failed_pin_attempts + 1 >= $3
                 THEN $4::timestamptz + ($5::bigint[])[least(lock_level, 2) + 1] * interval '1 millisecond'
                 ELSE locked_until END,
             lock_level = CASE WHEN failed_pin_attempts + 1 >= $3 THEN lock_level + 1 ELSE lock_level END
         WHERE event_id = $1 AND nickname_key = $2 AND failed_pin_attempts < $3 AND (locked_until IS NULL OR locked_until <= $4)
         RETURNING id, pin_hash, pin_salt, locked_until, locked_until > $4 AS just_locked`,
        [eventId, nicknameKey, MAX_WRONG_PINS, now, steps],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, pinHash: { hash: row.pin_hash, salt: row.pin_salt }, lockedUntil: row.just_locked ? row.locked_until : null };
}

/**
 * Checks a nickname and PIN for the active event.
 *
 * Wrong PINs on a real player are limited by the player's own lock, and across all players by
 * the event bucket. Unknown nicknames count only against the client address, so players who
 * share one address at a LAN cannot use up each other's tries with their own wrong PINs. The
 * slow scrypt check runs with no database connection held.
 */
export async function signInPlayer(pool: Pool, nicknameKey: string, pin: string, client: string, now: Date): Promise<SignInResult> {
    const active = await pool.query<{ id: number }>('SELECT id FROM events WHERE is_active');
    const eventId = active.rows[0]?.id;
    if (eventId === undefined) return { ok: false, error: 'no-event' };

    const known = await pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM players WHERE event_id = $1 AND nickname_key = $2', [eventId, nicknameKey]);
    if (!known.rows[0]) {
        if (!(await claimAttempts(pool, [{ bucket: client, limit: CLIENT_FAILURES_PER_HOUR }], now))) return { ok: false, error: 'busy' };
        // Same work as a real check, so the time does not tell whether the nickname exists.
        await verifyPin(pin, DUMMY_PIN_HASH);
        return { ok: false, error: 'wrong' };
    }

    const event = eventBucket(eventId);
    if (!(await claimAttempts(pool, [{ bucket: event, limit: EVENT_FAILURES_PER_HOUR }], now))) return { ok: false, error: 'busy' };
    const claim = await claimPinAttempt(pool, eventId, nicknameKey, now);
    if (!claim) {
        // The player is locked. This was not a guess, so it does not count.
        await releaseAttempt(pool, event, now);
        const current = await pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM players WHERE event_id = $1 AND nickname_key = $2', [eventId, nicknameKey]);
        const until = current.rows[0]?.locked_until ?? null;
        return { ok: false, error: 'locked', until: isLocked(until, now) ? until : null };
    }

    if (await verifyPin(pin, claim.pinHash)) {
        await pool.query('UPDATE players SET failed_pin_attempts = 0, lock_level = 0, locked_until = NULL WHERE id = $1', [claim.id]);
        await releaseAttempt(pool, event, now);
        return { ok: true, playerId: claim.id };
    }
    if (claim.lockedUntil) return { ok: false, error: 'locked', until: claim.lockedUntil };
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
