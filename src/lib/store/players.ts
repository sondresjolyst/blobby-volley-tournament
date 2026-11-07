import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { isLocked, lockDurationMs, MAX_WRONG_PINS, WRONG_PIN_MEMORY_MS } from '@/lib/players/lockout';
import { newJoinCode } from '@/lib/players/join-code';
import { DUMMY_PIN_HASH, hashPin, verifyPin, type PinHash } from '@/lib/players/pin';
import { hashSessionToken, isSessionExpired, newSessionToken, sessionExpiresAt } from '@/lib/players/session';
import { bumpAttempts, claimAttempts, releaseAttempt, windowStart } from './attempts';
import { addLedger } from './foza';
import { inTransaction } from './transaction';

const UNIQUE_VIOLATION = '23505';
const JOIN_CODE_CONSTRAINT = 'players_event_id_join_code_key';
// Two codes of 10 characters from 31 are almost never the same, so a few tries are plenty.
const JOIN_CODE_TRIES = 5;

function isJoinCodeClash(error: unknown): boolean {
    const { code, constraint } = error as { code?: unknown; constraint?: unknown };
    return code === UNIQUE_VIOLATION && constraint === JOIN_CODE_CONSTRAINT;
}

/**
 * Unknown nicknames and wrong event codes allowed per client address in an hour. It is generous,
 * because everyone at a LAN can share one address. Wrong PINs on real players do not count here.
 */
export const CLIENT_FAILURES_PER_HOUR = 100;
/**
 * Wrong PINs on real players per event in an hour, across all players, above which a warning is
 * logged. Sign-in is never blocked by it. The per-player lock is the guard.
 */
export const EVENT_FAILURES_PER_HOUR = 300;
/**
 * Wrong PINs on real players allowed per client address in an hour, across all players. Above it
 * the client cannot try a PIN until the hour is over.
 */
export const CLIENT_WRONG_PINS_PER_HOUR = 40;
/** New players allowed per client address in an hour. */
export const CLIENT_SIGN_UPS_PER_HOUR = 50;

export const eventBucket = (eventId: number) => `event:${eventId}`;
const PIN_BUCKET_PREFIX = 'pin:';
/** Forgets the wrong PINs of a player and lifts the lock. */
const CLEAR_PIN_LOCK = 'failed_pin_attempts = 0, locked_until = NULL, lock_level = 0, last_failed_pin_at = NULL';
export const pinBucket = (client: string) => `${PIN_BUCKET_PREFIX}${client}`;
export const signUpBucket = (client: string) => `signup:${client}`;

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

export type SignUpResult = { ok: true; playerId: number } | { ok: false; error: 'no-event' | 'code' | 'taken' | 'busy' | 'sign-ups' };

/**
 * Adds a player to the active event when the code matches. The player starts with the event's
 * starting Foza. A wrong code counts against the client's limit. Each new player counts against
 * the client's sign-up limit. The PIN is only hashed after the code is right.
 */
export async function signUpPlayer(pool: Pool, input: SignUpInput, client: string, now: Date): Promise<SignUpResult> {
    const active = await pool.query<{ id: number; code: string }>('SELECT id, code FROM events WHERE is_active');
    const event = active.rows[0];
    if (!event) return { ok: false, error: 'no-event' };
    if (!(await claimAttempts(pool, [{ bucket: client, limit: CLIENT_FAILURES_PER_HOUR }], now))) return { ok: false, error: 'busy' };
    if (!eventCodesMatch(event.code, input.code)) return { ok: false, error: 'code' };
    // A right code is not a failure.
    await releaseAttempt(pool, client, now);
    const signUps = signUpBucket(client);
    if (!(await claimAttempts(pool, [{ bucket: signUps, limit: CLIENT_SIGN_UPS_PER_HOUR }], now))) return { ok: false, error: 'sign-ups' };
    const result = await insertPlayer(pool, event, input);
    // Only a new player counts against the sign-up limit.
    if (!result.ok) await releaseAttempt(pool, signUps, now);
    return result;
}

async function insertPlayer(pool: Pool, event: { id: number; code: string }, input: SignUpInput): Promise<SignUpResult> {
    const pin = await hashPin(input.pin);
    for (let attempt = 1; ; attempt++) {
        try {
            return await inTransaction(pool, async (tx) => {
                const { rows } = await tx.query<{ id: number; starting_foza: number }>(
                    `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code)
                     SELECT id, $2, $3, $4, $5, 0, $7 FROM events WHERE id = $1 AND is_active AND code = $6
                     RETURNING id, (SELECT starting_foza FROM events WHERE id = $1) AS starting_foza`,
                    [event.id, input.nickname, input.nicknameKey, pin.hash, pin.salt, event.code, newJoinCode()],
                );
                // The event was changed between the two queries.
                if (!rows[0]) return { ok: false as const, error: 'code' as const };
                // The starting Foza is the first ledger row. The ledger trigger adds it to the balance.
                await addLedger(tx, [{ playerId: rows[0].id, type: 'starting', amount: rows[0].starting_foza }]);
                return { ok: true as const, playerId: rows[0].id };
            });
        } catch (error) {
            if (isJoinCodeClash(error) && attempt < JOIN_CODE_TRIES) continue;
            if ((error as { code?: unknown }).code === UNIQUE_VIOLATION && !isJoinCodeClash(error)) return { ok: false, error: 'taken' };
            throw error;
        }
    }
}

export type SignInResult =
    | { ok: true; playerId: number }
    | { ok: false; error: 'no-event' | 'wrong' | 'busy' | 'pins' }
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
 * than 5 wrong PINs. Wrong PINs are forgotten when the last one is more than a day old. The
 * claim that uses the fifth try also sets the lock, with an end time from the lock level, and
 * raises the level. So a crash after the claim can never leave a player blocked without an end
 * time. Returns null when the player is locked or does not exist.
 */
export async function claimPinAttempt(pool: Pool, eventId: number, nicknameKey: string, now: Date): Promise<PinClaim | null> {
    const steps = [0, 1, 2].map(lockDurationMs);
    const forgetBefore = new Date(now.getTime() - WRONG_PIN_MEMORY_MS);
    // The wrong PINs that still count. Old ones count as none.
    const failed = '(CASE WHEN last_failed_pin_at > $6 THEN failed_pin_attempts ELSE 0 END)';
    const { rows } = await pool.query<{ id: number; pin_hash: Buffer; pin_salt: Buffer; locked_until: Date | null; just_locked: boolean }>(
        `UPDATE players SET
             failed_pin_attempts = CASE WHEN ${failed} + 1 >= $3 THEN 0 ELSE ${failed} + 1 END,
             locked_until = CASE WHEN ${failed} + 1 >= $3
                 THEN $4::timestamptz + ($5::bigint[])[least(lock_level, 2) + 1] * interval '1 millisecond'
                 ELSE locked_until END,
             lock_level = CASE WHEN ${failed} + 1 >= $3 THEN lock_level + 1 ELSE lock_level END,
             last_failed_pin_at = $4
         WHERE event_id = $1 AND nickname_key = $2 AND ${failed} < $3 AND (locked_until IS NULL OR locked_until <= $4)
         RETURNING id, pin_hash, pin_salt, locked_until, locked_until > $4 AS just_locked`,
        [eventId, nicknameKey, MAX_WRONG_PINS, now, steps, forgetBefore],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, pinHash: { hash: row.pin_hash, salt: row.pin_salt }, lockedUntil: row.just_locked ? row.locked_until : null };
}

/**
 * Checks a nickname and PIN for the active event.
 *
 * Wrong PINs on a real player are limited by the player's own escalating lock and by the hourly
 * limit of the client address across all players. A client over that limit cannot try a PIN
 * until the hour is over. Wrong PINs are also counted per event, and a warning is logged when the
 * event goes over its hourly limit, but that count never blocks anyone. Unknown nicknames count
 * only against the client's limit for unknown nicknames and wrong codes. The slow scrypt check
 * runs with no database connection held.
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

    // The claim counts as a wrong PIN for the client until a right PIN takes it back.
    const pins = pinBucket(client);
    if (!(await claimAttempts(pool, [{ bucket: pins, limit: CLIENT_WRONG_PINS_PER_HOUR }], now))) return { ok: false, error: 'pins' };
    const claim = await claimPinAttempt(pool, eventId, nicknameKey, now);
    if (!claim) {
        // The player is locked. This was not a guess, so it does not count.
        await releaseAttempt(pool, pins, now);
        const current = await pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM players WHERE event_id = $1 AND nickname_key = $2', [eventId, nicknameKey]);
        const until = current.rows[0]?.locked_until ?? null;
        return { ok: false, error: 'locked', until: isLocked(until, now) ? until : null };
    }

    if (await verifyPin(pin, claim.pinHash)) {
        await pool.query(`UPDATE players SET ${CLEAR_PIN_LOCK} WHERE id = $1`, [claim.id]);
        await releaseAttempt(pool, pins, now);
        return { ok: true, playerId: claim.id };
    }
    const wrongPins = await bumpAttempts(pool, eventBucket(eventId), now);
    if (wrongPins > EVENT_FAILURES_PER_HOUR) {
        console.warn(`Event ${eventId} has ${wrongPins} wrong PINs this hour, over the limit of ${EVENT_FAILURES_PER_HOUR}. Sign-in is not blocked.`);
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

/**
 * The secret join code of a player, or null when there is no such player. Only the player's own
 * page may show it, and only inside the join link.
 */
export async function getJoinCode(pool: Pool, playerId: number): Promise<string | null> {
    const { rows } = await pool.query<{ join_code: string }>('SELECT join_code FROM players WHERE id = $1', [playerId]);
    return rows[0]?.join_code ?? null;
}

export async function deleteSession(pool: Pool, token: string): Promise<void> {
    await pool.query('DELETE FROM player_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

export interface PlayerRow {
    id: number;
    nickname: string;
    fozaBalance: number;
    lockedUntil: Date | null;
    /** Wrong PINs since the last lock or right PIN. Use countedWrongPins for the ones that still count. */
    failedPinAttempts: number;
    lastFailedPinAt: Date | null;
    createdAt: Date;
}

export async function listPlayers(pool: Pool, eventId: number): Promise<PlayerRow[]> {
    const { rows } = await pool.query<{
        id: number;
        nickname: string;
        foza_balance: number;
        locked_until: Date | null;
        failed_pin_attempts: number;
        last_failed_pin_at: Date | null;
        created_at: Date;
    }>('SELECT id, nickname, foza_balance, locked_until, failed_pin_attempts, last_failed_pin_at, created_at FROM players WHERE event_id = $1 ORDER BY nickname_key', [eventId]);
    return rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        fozaBalance: row.foza_balance,
        lockedUntil: row.locked_until,
        failedPinAttempts: row.failed_pin_attempts,
        lastFailedPinAt: row.last_failed_pin_at,
        createdAt: row.created_at,
    }));
}

/** Forgets the wrong PINs of a player and lifts any lock, so the player can sign in again. The PIN and the sessions stay. */
export async function unlockPlayer(pool: Pool, playerId: number): Promise<{ eventId: number } | null> {
    const { rows } = await pool.query<{ event_id: number }>(`UPDATE players SET ${CLEAR_PIN_LOCK} WHERE id = $1 RETURNING event_id`, [playerId]);
    return rows[0] ? { eventId: rows[0].event_id } : null;
}

/** The most wrong PINs from one client address in this hour. At a LAN most players share one address. */
export async function busiestPinClient(pool: Pool, now: Date): Promise<number> {
    const { rows } = await pool.query<{ count: number | null }>('SELECT max(count) AS count FROM auth_attempts WHERE starts_with(bucket, $1) AND window_start = $2', [
        PIN_BUCKET_PREFIX,
        windowStart(now),
    ]);
    return rows[0]?.count ?? 0;
}

/** Forgets the wrong PINs of every client address, so a network over its hourly limit can try PINs again. */
export async function resetPinLimits(pool: Pool): Promise<void> {
    await pool.query('DELETE FROM auth_attempts WHERE starts_with(bucket, $1)', [PIN_BUCKET_PREFIX]);
}

/** Gives a player a new PIN, lifts any lock and signs the player out on every device. */
export async function resetPlayerPin(pool: Pool, playerId: number, pin: PinHash): Promise<{ eventId: number } | null> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ event_id: number }>(
            `UPDATE players SET pin_hash = $2, pin_salt = $3, ${CLEAR_PIN_LOCK} WHERE id = $1 RETURNING event_id`,
            [playerId, pin.hash, pin.salt],
        );
        if (!rows[0]) return null;
        await client.query('DELETE FROM player_sessions WHERE player_id = $1', [playerId]);
        return { eventId: rows[0].event_id };
    });
}

/**
 * Gives a player a new join code, so the old one stops working at the next sync of the game
 * server. Returns null when the player does not exist.
 */
export async function rotateJoinCode(pool: Pool, playerId: number): Promise<{ eventId: number } | null> {
    for (let attempt = 1; ; attempt++) {
        try {
            const { rows } = await pool.query<{ event_id: number }>('UPDATE players SET join_code = $2 WHERE id = $1 RETURNING event_id', [playerId, newJoinCode()]);
            return rows[0] ? { eventId: rows[0].event_id } : null;
        } catch (error) {
            if (isJoinCodeClash(error) && attempt < JOIN_CODE_TRIES) continue;
            throw error;
        }
    }
}
