import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { isLocked, lockDurationMs, MAX_WRONG_PINS, WRONG_PIN_MEMORY_MS } from '@/lib/players/lockout';
import { newJoinCode } from '@/lib/players/join-code';
import { DUMMY_PIN_HASH, hashPin, verifyPin, type PinHash } from '@/lib/players/pin';
import { hashSessionToken, isSessionExpired, newSessionToken, sessionExpiresAt } from '@/lib/players/session';
import { bumpAttempts, claimAttempts, releaseAttempt, windowStart } from './attempts';
import { addLedger } from './foza';
import { inTransaction } from './transaction';

const UNIQUE_VIOLATION = '23505';
const JOIN_CODE_CONSTRAINT = 'players_event_id_join_code_key';
const NICKNAME_CONSTRAINT = 'accounts_nickname_key_key';
// Two codes of 10 characters from 31 are almost never the same, so a few tries are plenty.
const JOIN_CODE_TRIES = 5;

function isClash(error: unknown, name: string): boolean {
    const { code, constraint } = error as { code?: unknown; constraint?: unknown };
    return code === UNIQUE_VIOLATION && constraint === name;
}

const isJoinCodeClash = (error: unknown) => isClash(error, JOIN_CODE_CONSTRAINT);
const isNicknameClash = (error: unknown) => isClash(error, NICKNAME_CONSTRAINT);

/**
 * Unknown nicknames and wrong event codes allowed per client address in an hour. It is generous,
 * because everyone at a LAN can share one address. Wrong PINs on real players do not count here.
 */
export const CLIENT_FAILURES_PER_HOUR = 100;
/**
 * Wrong PINs on real players per event in an hour, across all players, above which a warning is
 * logged. Sign-in is never blocked by it. The per-account lock is the guard.
 */
export const EVENT_FAILURES_PER_HOUR = 300;
/**
 * Wrong PINs on real players allowed per client address in an hour, across all players. Above it
 * the client cannot try a PIN until the hour is over.
 */
export const CLIENT_WRONG_PINS_PER_HOUR = 40;
/** New accounts allowed per client address in an hour. */
export const CLIENT_SIGN_UPS_PER_HOUR = 50;
/** How long a player waits after a change of nickname before the next one. */
export const NICKNAME_CHANGE_WAIT_MS = 60 * 60 * 1000;

export const eventBucket = (eventId: number) => `event:${eventId}`;
const PIN_BUCKET_PREFIX = 'pin:';
/** Forgets the wrong PINs of an account and lifts the lock. */
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

export type SignUpResult = { ok: true; accountId: number; playerId: number } | { ok: false; error: 'no-event' | 'code' | 'taken' | 'busy' | 'sign-ups' };

/**
 * Makes a new account and its player in the active event when the code matches. The nickname must
 * be free across all accounts, ignoring case. The player starts with the event's starting Foza. A
 * wrong code counts against the client's limit. Each new account counts against the client's
 * sign-up limit. The PIN is only hashed after the code is right.
 */
export async function signUpPlayer(pool: Pool, input: SignUpInput, client: string, now: Date): Promise<SignUpResult> {
    const checked = await checkEventCode(pool, input.code, client, now);
    if (!checked.ok) return checked;
    const signUps = signUpBucket(client);
    if (!(await claimAttempts(pool, [{ bucket: signUps, limit: CLIENT_SIGN_UPS_PER_HOUR }], now))) return { ok: false, error: 'sign-ups' };
    const result = await insertAccount(pool, checked.event, input);
    // Only a new account counts against the sign-up limit.
    if (!result.ok) await releaseAttempt(pool, signUps, now);
    return result;
}

type ActiveEvent = { id: number; code: string };
type EventCheck = { ok: true; event: ActiveEvent } | { ok: false; error: 'no-event' | 'code' | 'busy' };

/** Finds the active event and checks the code the player typed. A wrong code counts against the client's limit. */
async function checkEventCode(pool: Pool, code: string, client: string, now: Date): Promise<EventCheck> {
    const active = await pool.query<ActiveEvent>('SELECT id, code FROM events WHERE is_active');
    const event = active.rows[0];
    if (!event) return { ok: false, error: 'no-event' };
    if (!(await claimAttempts(pool, [{ bucket: client, limit: CLIENT_FAILURES_PER_HOUR }], now))) return { ok: false, error: 'busy' };
    if (!eventCodesMatch(event.code, code)) return { ok: false, error: 'code' };
    // A right code is not a failure.
    await releaseAttempt(pool, client, now);
    return { ok: true, event };
}

/**
 * Adds the player row of an account to the event, with a new join code and the starting Foza as
 * the first ledger row. Returns null when the event is no longer active with this code.
 */
async function insertPlayer(tx: PoolClient, event: ActiveEvent, accountId: number): Promise<number | null> {
    const { rows } = await tx.query<{ id: number; starting_foza: number }>(
        `INSERT INTO players (event_id, account_id, foza_balance, join_code)
         SELECT id, $2, 0, $4 FROM events WHERE id = $1 AND is_active AND code = $3
         RETURNING id, (SELECT starting_foza FROM events WHERE id = $1) AS starting_foza`,
        [event.id, accountId, event.code, newJoinCode()],
    );
    if (!rows[0]) return null;
    // The ledger trigger adds the starting Foza to the balance.
    await addLedger(tx, [{ playerId: rows[0].id, type: 'starting', amount: rows[0].starting_foza }]);
    return rows[0].id;
}

/** Thrown inside a transaction when the event changed after its code was checked, so the account is rolled back too. */
class EventChanged extends Error {}

async function insertAccount(pool: Pool, event: ActiveEvent, input: SignUpInput): Promise<SignUpResult> {
    const pin = await hashPin(input.pin);
    for (let attempt = 1; ; attempt++) {
        try {
            return await inTransaction(pool, async (tx) => {
                const { rows } = await tx.query<{ id: number }>('INSERT INTO accounts (nickname, nickname_key, pin_hash, pin_salt) VALUES ($1, $2, $3, $4) RETURNING id', [
                    input.nickname,
                    input.nicknameKey,
                    pin.hash,
                    pin.salt,
                ]);
                const accountId = rows[0].id;
                const playerId = await insertPlayer(tx, event, accountId);
                if (playerId === null) throw new EventChanged();
                return { ok: true as const, accountId, playerId };
            });
        } catch (error) {
            if (error instanceof EventChanged) return { ok: false, error: 'code' };
            if (isJoinCodeClash(error) && attempt < JOIN_CODE_TRIES) continue;
            if (isNicknameClash(error)) return { ok: false, error: 'taken' };
            throw error;
        }
    }
}

export type JoinEventResult = { ok: true; playerId: number } | { ok: false; error: 'no-event' | 'code' | 'busy' };

/**
 * Adds an account to the active event when the code matches, with the starting Foza and a join
 * code. An account that is already in the event keeps its player. A wrong code counts against the
 * client's limit, as at sign-up.
 */
export async function joinEvent(pool: Pool, accountId: number, code: string, client: string, now: Date): Promise<JoinEventResult> {
    const checked = await checkEventCode(pool, code, client, now);
    if (!checked.ok) return checked;
    for (let attempt = 1; ; attempt++) {
        try {
            return await inTransaction(pool, async (tx) => {
                // Two joins at once wait for each other here, so only one adds the player.
                const account = await tx.query('SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
                if (!account.rowCount) return { ok: false as const, error: 'code' as const };
                const known = await tx.query<{ id: number }>('SELECT id FROM players WHERE event_id = $1 AND account_id = $2', [checked.event.id, accountId]);
                if (known.rows[0]) return { ok: true as const, playerId: known.rows[0].id };
                const playerId = await insertPlayer(tx, checked.event, accountId);
                if (playerId === null) return { ok: false as const, error: 'code' as const };
                return { ok: true as const, playerId };
            });
        } catch (error) {
            if (isJoinCodeClash(error) && attempt < JOIN_CODE_TRIES) continue;
            throw error;
        }
    }
}

export type RenameResult = { ok: true } | { ok: false; error: 'taken' | 'too-soon' };

/**
 * Gives an account a new nickname. Every player row of the account, in past events too, shows it
 * at once, and Elo and history stay with the account. The nickname must be free across all
 * accounts, ignoring case. After a change the player waits an hour before the next one. The same
 * nickname again changes nothing.
 */
export async function renameAccount(pool: Pool, accountId: number, nickname: string, nicknameKey: string, now: Date): Promise<RenameResult> {
    const waitedSince = new Date(now.getTime() - NICKNAME_CHANGE_WAIT_MS);
    try {
        return await inTransaction(pool, async (tx) => {
            const current = await tx.query<{ nickname: string; nickname_changed_at: Date | null }>('SELECT nickname, nickname_changed_at FROM accounts WHERE id = $1 FOR UPDATE', [
                accountId,
            ]);
            const row = current.rows[0];
            if (!row || row.nickname === nickname) return { ok: true as const };
            if (row.nickname_changed_at && row.nickname_changed_at > waitedSince) return { ok: false as const, error: 'too-soon' as const };
            await tx.query('UPDATE accounts SET nickname = $2, nickname_key = $3, nickname_changed_at = $4 WHERE id = $1', [accountId, nickname, nicknameKey, now]);
            console.info(`Account ${accountId} changed the nickname from "${row.nickname}" to "${nickname}".`);
            return { ok: true as const };
        });
    } catch (error) {
        if (isNicknameClash(error)) return { ok: false, error: 'taken' };
        throw error;
    }
}

export type SignInResult =
    | { ok: true; accountId: number }
    | { ok: false; error: 'no-event' | 'wrong' | 'busy' | 'pins' }
    | { ok: false; error: 'locked'; until: Date | null };

export interface PinClaim {
    id: number;
    pinHash: PinHash;
    /** Set when this claim used the last try and locked the account. */
    lockedUntil: Date | null;
}

/**
 * Claims one PIN check for an account in one atomic statement. The claim counts as a wrong PIN
 * until a right PIN clears it. It only succeeds while the account is not locked and has fewer
 * than 5 wrong PINs. Wrong PINs are forgotten when the last one is more than a day old. The
 * claim that uses the fifth try also sets the lock, with an end time from the lock level, and
 * raises the level. So a crash after the claim can never leave an account blocked without an end
 * time. Returns null when the account is locked or does not exist.
 */
export async function claimPinAttempt(pool: Pool, nicknameKey: string, now: Date): Promise<PinClaim | null> {
    const steps = [0, 1, 2].map(lockDurationMs);
    const forgetBefore = new Date(now.getTime() - WRONG_PIN_MEMORY_MS);
    // The wrong PINs that still count. Old ones count as none.
    const failed = '(CASE WHEN last_failed_pin_at > $5 THEN failed_pin_attempts ELSE 0 END)';
    const { rows } = await pool.query<{ id: number; pin_hash: Buffer; pin_salt: Buffer; locked_until: Date | null; just_locked: boolean }>(
        `UPDATE accounts SET
             failed_pin_attempts = CASE WHEN ${failed} + 1 >= $2 THEN 0 ELSE ${failed} + 1 END,
             locked_until = CASE WHEN ${failed} + 1 >= $2
                 THEN $3::timestamptz + ($4::bigint[])[least(lock_level, 2) + 1] * interval '1 millisecond'
                 ELSE locked_until END,
             lock_level = CASE WHEN ${failed} + 1 >= $2 THEN lock_level + 1 ELSE lock_level END,
             last_failed_pin_at = $3
         WHERE nickname_key = $1 AND ${failed} < $2 AND (locked_until IS NULL OR locked_until <= $3)
         RETURNING id, pin_hash, pin_salt, locked_until, locked_until > $3 AS just_locked`,
        [nicknameKey, MAX_WRONG_PINS, now, steps, forgetBefore],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, pinHash: { hash: row.pin_hash, salt: row.pin_salt }, lockedUntil: row.just_locked ? row.locked_until : null };
}

/**
 * Checks a nickname and PIN of an account. Sign-in needs an active event, since a player plays
 * at the LAN of the moment.
 *
 * Wrong PINs on a real account are limited by the account's own escalating lock and by the
 * hourly limit of the client address across all accounts. A client over that limit cannot try a
 * PIN until the hour is over. Wrong PINs are also counted per event, and a warning is logged when
 * the event goes over its hourly limit, but that count never blocks anyone. Unknown nicknames
 * count only against the client's limit for unknown nicknames and wrong codes. The slow scrypt
 * check runs with no database connection held.
 */
export async function signInPlayer(pool: Pool, nicknameKey: string, pin: string, client: string, now: Date): Promise<SignInResult> {
    const active = await pool.query<{ id: number }>('SELECT id FROM events WHERE is_active');
    const eventId = active.rows[0]?.id;
    if (eventId === undefined) return { ok: false, error: 'no-event' };

    const known = await pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM accounts WHERE nickname_key = $1', [nicknameKey]);
    if (!known.rows[0]) {
        if (!(await claimAttempts(pool, [{ bucket: client, limit: CLIENT_FAILURES_PER_HOUR }], now))) return { ok: false, error: 'busy' };
        // Same work as a real check, so the time does not tell whether the nickname exists.
        await verifyPin(pin, DUMMY_PIN_HASH);
        return { ok: false, error: 'wrong' };
    }

    // The claim counts as a wrong PIN for the client until a right PIN takes it back.
    const pins = pinBucket(client);
    if (!(await claimAttempts(pool, [{ bucket: pins, limit: CLIENT_WRONG_PINS_PER_HOUR }], now))) return { ok: false, error: 'pins' };
    const claim = await claimPinAttempt(pool, nicknameKey, now);
    if (!claim) {
        // The account is locked. This was not a guess, so it does not count.
        await releaseAttempt(pool, pins, now);
        const current = await pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM accounts WHERE nickname_key = $1', [nicknameKey]);
        const until = current.rows[0]?.locked_until ?? null;
        return { ok: false, error: 'locked', until: isLocked(until, now) ? until : null };
    }

    if (await verifyPin(pin, claim.pinHash)) {
        await pool.query(`UPDATE accounts SET ${CLEAR_PIN_LOCK} WHERE id = $1`, [claim.id]);
        await releaseAttempt(pool, pins, now);
        return { ok: true, accountId: claim.id };
    }
    const wrongPins = await bumpAttempts(pool, eventBucket(eventId), now);
    if (wrongPins > EVENT_FAILURES_PER_HOUR) {
        console.warn(`Event ${eventId} has ${wrongPins} wrong PINs this hour, over the limit of ${EVENT_FAILURES_PER_HOUR}. Sign-in is not blocked.`);
    }
    if (claim.lockedUntil) return { ok: false, error: 'locked', until: claim.lockedUntil };
    return { ok: false, error: 'wrong' };
}

/** Starts a session of an account and returns the token for the cookie. Only its hash is stored. */
export async function createSession(pool: Pool, accountId: number, now: Date): Promise<{ token: string; expiresAt: Date }> {
    const token = newSessionToken();
    const expiresAt = sessionExpiresAt(now);
    await pool.query('DELETE FROM player_sessions WHERE account_id = $1 AND expires_at <= $2', [accountId, now]);
    await pool.query('INSERT INTO player_sessions (token_hash, account_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
        hashSessionToken(token),
        accountId,
        now,
        expiresAt,
    ]);
    return { token, expiresAt };
}

/** The player row of an account in the active event. */
export interface SessionPlayer {
    id: number;
    nickname: string;
    fozaBalance: number;
    eventId: number;
    eventName: string;
}

export interface SessionAccount {
    accountId: number;
    nickname: string;
    /** The player of the account in the active event. Null when there is no active event or the account has not joined it yet. */
    player: SessionPlayer | null;
}

/** The account of a session that has not expired, with its player in the active event, or null. */
export async function getSessionAccount(pool: Pool, token: string, now: Date): Promise<SessionAccount | null> {
    const tokenHash = hashSessionToken(token);
    const { rows } = await pool.query<{
        account_id: number;
        nickname: string;
        expires_at: Date;
        player_id: number | null;
        foza_balance: number | null;
        event_id: number | null;
        event_name: string | null;
    }>(
        `SELECT a.id AS account_id, a.nickname, s.expires_at, p.id AS player_id, p.foza_balance, e.id AS event_id, e.name AS event_name
         FROM player_sessions s
         JOIN accounts a ON a.id = s.account_id
         LEFT JOIN events e ON e.is_active
         LEFT JOIN players p ON p.account_id = a.id AND p.event_id = e.id
         WHERE s.token_hash = $1`,
        [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    if (isSessionExpired(row.expires_at, now)) {
        await pool.query('DELETE FROM player_sessions WHERE token_hash = $1', [tokenHash]);
        return null;
    }
    const player =
        row.player_id !== null && row.event_id !== null
            ? { id: row.player_id, nickname: row.nickname, fozaBalance: row.foza_balance ?? 0, eventId: row.event_id, eventName: row.event_name ?? '' }
            : null;
    return { accountId: row.account_id, nickname: row.nickname, player };
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
    /** The PIN lock of the account. */
    lockedUntil: Date | null;
    /** Wrong PINs on the account since the last lock or right PIN. Use countedWrongPins for the ones that still count. */
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
    }>(
        `SELECT p.id, p.nickname, p.foza_balance, a.locked_until, a.failed_pin_attempts, a.last_failed_pin_at, p.created_at
         FROM players p JOIN accounts a ON a.id = p.account_id
         WHERE p.event_id = $1 ORDER BY p.nickname_key`,
        [eventId],
    );
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

/**
 * Forgets the wrong PINs of the account of a player and lifts any lock, so the player can sign in
 * again. The lock level goes back to 0 on purpose. An unlock by an admin is a fresh start, so the
 * next lock is the shortest again. The PIN and the sessions stay.
 */
export async function unlockPlayer(pool: Pool, playerId: number): Promise<{ eventId: number } | null> {
    const { rows } = await pool.query<{ event_id: number }>(
        `UPDATE accounts a SET ${CLEAR_PIN_LOCK} FROM players p WHERE p.id = $1 AND a.id = p.account_id RETURNING p.event_id`,
        [playerId],
    );
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

/**
 * Gives the account of a player a new PIN, lifts any lock and signs the account out on every
 * device. The PIN is the same at every LAN.
 */
export async function resetPlayerPin(pool: Pool, playerId: number, pin: PinHash): Promise<{ eventId: number } | null> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ event_id: number; account_id: number }>(
            `UPDATE accounts a SET pin_hash = $2, pin_salt = $3, ${CLEAR_PIN_LOCK} FROM players p WHERE p.id = $1 AND a.id = p.account_id RETURNING p.event_id, a.id AS account_id`,
            [playerId, pin.hash, pin.salt],
        );
        if (!rows[0]) return null;
        await client.query('DELETE FROM player_sessions WHERE account_id = $1', [rows[0].account_id]);
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
