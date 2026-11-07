import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, readMigrations } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import { hashPin } from '@/lib/players/pin';
import { hashSessionToken, SESSION_MS } from '@/lib/players/session';
import { clearActiveEvent, createEvent, getActiveEvent, getEvent, listEvents, setActiveEvent, updateEvent } from './events';
import { bumpAttempts, claimAttempts, readAttempts, windowStart } from './attempts';
import {
    claimPinAttempt,
    CLIENT_FAILURES_PER_HOUR,
    CLIENT_SIGN_UPS_PER_HOUR,
    CLIENT_WRONG_PINS_PER_HOUR,
    createSession,
    deleteSession,
    EVENT_FAILURES_PER_HOUR,
    eventBucket,
    getSessionPlayer,
    busiestPinClient,
    listPlayers,
    pinBucket,
    resetPinLimits,
    resetPlayerPin,
    signInPlayer,
    signUpBucket,
    signUpPlayer,
    type SignUpInput,
    unlockPlayer,
} from './players';

// Runs inside each PIN check, so a test can see how many connections are checked out at that moment.
const verifyHook = vi.hoisted(() => ({ run: null as null | (() => void) }));
vi.mock('@/lib/players/pin', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/players/pin')>();
    return {
        ...actual,
        verifyPin: (...args: Parameters<typeof actual.verifyPin>) => {
            verifyHook.run?.();
            return actual.verifyPin(...args);
        },
    };
});

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const lastYear: EventInput = { name: 'LAN 2025', startsOn: '2025-11-21', endsOn: '2025-11-23', code: 'LAN-2025', startingFoza: 500, dailyFoza: 50 };
const now = new Date('2026-11-20T18:00:00Z');
const client = 'ip:192.0.2.10';
const MINUTE = 60 * 1000;

const signUp = (input: SignUpInput, from = client, at = now) => signUpPlayer(pool, input, from, at);
const signIn = (nicknameKey: string, pin: string, at = now, from = client) => signInPlayer(pool, nicknameKey, pin, from, at);

/** Sets a bucket's count in the window that holds `at`. */
async function setAttempts(bucket: string, count: number, at = now) {
    await pool.query('INSERT INTO auth_attempts (bucket, window_start, count) VALUES ($1, $2, $3) ON CONFLICT (bucket, window_start) DO UPDATE SET count = $3', [
        bucket,
        windowStart(at),
        count,
    ]);
}

async function activeEventWithPlayer(nickname = 'Ola', pin = '1234') {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    const result = await signUp({ code: lan.code, nickname, nicknameKey: nickname.toLowerCase(), pin: pin });
    if (!result.ok) throw new Error(result.error);
    return { eventId, playerId: result.playerId };
}

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

describe('migrate', () => {
    it('applies every file once and records it', async () => {
        const names = readMigrations().map((m) => m.name);
        expect(names[0]).toBe('0001_events_players.sql');
        const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
        expect(rows.map((r) => r.name)).toEqual(names);
    });

    it('does nothing on a second run and keeps the data', async () => {
        await createEvent(pool, lan);
        expect(await migrate(pool)).toEqual([]);
        expect(await listEvents(pool)).toHaveLength(1);
    });

    it('applies new files in number order and rolls back a file that fails', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            writeFileSync(join(dir, '0002_b.sql'), 'CREATE TABLE b (id int)');
            writeFileSync(join(dir, '0001_a.sql'), 'CREATE TABLE a (id int)');
            writeFileSync(join(dir, 'notes.txt'), 'not a migration');
            await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
            expect(await migrate(pool, dir)).toEqual(['0001_a.sql', '0002_b.sql']);

            writeFileSync(join(dir, '0003_bad.sql'), 'CREATE TABLE c (id int); SELECT * FROM missing_table');
            await expect(migrate(pool, dir)).rejects.toThrow(/missing_table/);
            expect((await pool.query("SELECT to_regclass('c') AS c")).rows[0].c).toBeNull();
            expect((await pool.query("SELECT 1 FROM schema_migrations WHERE name = '0003_bad.sql'")).rowCount).toBe(0);

            // The file and its record go in one transaction. When the record cannot be written, the file is undone too.
            writeFileSync(join(dir, '0003_bad.sql'), 'CREATE TABLE c (id int); ALTER TABLE schema_migrations RENAME TO gone');
            await expect(migrate(pool, dir)).rejects.toThrow(/schema_migrations/);
            expect((await pool.query("SELECT to_regclass('c') AS c")).rows[0].c).toBeNull();
            expect((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n).toBe(2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses two files with the same number', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            writeFileSync(join(dir, '0001_a.sql'), 'SELECT 1');
            writeFileSync(join(dir, '0001_b.sql'), 'SELECT 1');
            expect(() => readMigrations(dir)).toThrow('share a number');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('schema', () => {
    it('allows only one active event', async () => {
        const a = await createEvent(pool, lan);
        const b = await createEvent(pool, lastYear);
        await pool.query('UPDATE events SET is_active = true WHERE id = $1', [a]);
        await expect(pool.query('UPDATE events SET is_active = true WHERE id = $1', [b])).rejects.toThrow(/events_one_active_idx/);
    });

    it('limits a nickname to 15 bytes, so 8 Norwegian letters do not fit', async () => {
        const { eventId } = await activeEventWithPlayer();
        const pin = await hashPin('1234');
        // The key is short and differs each time, so only the nickname column is checked.
        let n = 0;
        const insert = (nickname: string) =>
            pool.query('INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code) VALUES ($1, $2, $3, $4, $5, 0, $6)', [
                eventId,
                nickname,
                `k${n++}`,
                pin.hash,
                pin.salt,
                newJoinCode(),
            ]);
        await expect(insert('æøåæøåæø')).rejects.toThrow(/players_nickname_check/);
        await expect(insert(' padded')).rejects.toThrow(/players_nickname_check/);
        await insert('æøåæøåæa');
    });

    it('has no column for a plain PIN', async () => {
        const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'players'");
        expect(rows.map((r) => r.column_name)).not.toContain('pin');
    });
});

describe('events', () => {
    it('creates, reads and edits an event', async () => {
        const id = await createEvent(pool, lan);
        expect(await getEvent(pool, id)).toEqual({ id, ...lan, isActive: false, serverHost: null, serverPort: null, gameBoard: 'off' });
        expect(await updateEvent(pool, id, { ...lan, name: 'LAN 2026 B', dailyFoza: 150, serverHost: 'lan-pc.local', serverPort: 1234 })).toBe(true);
        expect(await getEvent(pool, id)).toMatchObject({ name: 'LAN 2026 B', dailyFoza: 150, serverHost: 'lan-pc.local', serverPort: 1234 });
        expect(await updateEvent(pool, id, { ...lan, serverHost: null, serverPort: null })).toBe(true);
        expect(await getEvent(pool, id)).toMatchObject({ serverHost: null, serverPort: null });
        expect(await updateEvent(pool, id + 100, lan)).toBe(false);
        expect(await getEvent(pool, id + 100)).toBeNull();
    });

    it('lists events with the newest first and keeps past events', async () => {
        const old = await createEvent(pool, lastYear);
        const current = await createEvent(pool, lan);
        expect((await listEvents(pool)).map((e) => e.id)).toEqual([current, old]);
    });

    it('sets one event active and the others inactive', async () => {
        const old = await createEvent(pool, lastYear);
        const current = await createEvent(pool, lan);
        expect(await setActiveEvent(pool, old)).toBe(true);
        expect((await getActiveEvent(pool))?.id).toBe(old);
        expect(await setActiveEvent(pool, current)).toBe(true);
        expect((await getActiveEvent(pool))?.id).toBe(current);
        expect((await listEvents(pool)).filter((e) => e.isActive)).toHaveLength(1);
        expect(await setActiveEvent(pool, current + 100)).toBe(false);
        expect((await getActiveEvent(pool))?.id).toBe(current);
    });

    it('handles two admins setting different events active at the same time', async () => {
        const ids = await Promise.all([createEvent(pool, lan), createEvent(pool, lastYear), createEvent(pool, lan)]);
        await Promise.all(ids.map((id) => setActiveEvent(pool, id)));
        expect((await listEvents(pool)).filter((e) => e.isActive)).toHaveLength(1);
    });

    it('can close the active event', async () => {
        await setActiveEvent(pool, await createEvent(pool, lan));
        await clearActiveEvent(pool);
        expect(await getActiveEvent(pool)).toBeNull();
    });
});

describe('signUpPlayer', () => {
    it('adds a player to the active event with the starting Foza and a hashed PIN', async () => {
        const { eventId, playerId } = await activeEventWithPlayer('Ola', '1234');
        const { rows } = await pool.query('SELECT event_id, nickname, nickname_key, foza_balance, pin_hash, pin_salt FROM players WHERE id = $1', [playerId]);
        expect(rows[0]).toMatchObject({ event_id: eventId, nickname: 'Ola', nickname_key: 'ola', foza_balance: 1000 });
        expect(rows[0].pin_hash.toString('utf8')).not.toContain('1234');
        expect(rows[0].pin_salt.length).toBe(16);
    });

    it('refuses a wrong code and a time with no active event', async () => {
        const pin = '1234';
        const input = { code: lan.code, nickname: 'Ola', nicknameKey: 'ola', pin };
        expect(await signUp(input)).toEqual({ ok: false, error: 'no-event' });
        await setActiveEvent(pool, await createEvent(pool, lan));
        expect(await signUp({ ...input, code: 'LAN-2025' })).toEqual({ ok: false, error: 'code' });
    });

    it('refuses a code from another, inactive event', async () => {
        await createEvent(pool, lastYear);
        await setActiveEvent(pool, await createEvent(pool, lan));
        expect(await signUp({ code: lastYear.code, nickname: 'Ola', nicknameKey: 'ola', pin: '1234' })).toEqual({ ok: false, error: 'code' });
    });

    it('keeps nicknames unique per event, ignoring case', async () => {
        await activeEventWithPlayer('Ola');
        expect(await signUp({ code: lan.code, nickname: 'OLA', nicknameKey: 'ola', pin: '9999' })).toEqual({ ok: false, error: 'taken' });
    });

    it('lets the same nickname sign up again in a new event as a new player', async () => {
        const first = await activeEventWithPlayer('Ola');
        const next = await createEvent(pool, { ...lan, name: 'LAN 2027', code: 'LAN-2027' });
        await setActiveEvent(pool, next);
        const again = await signUp({ code: 'LAN-2027', nickname: 'Ola', nicknameKey: 'ola', pin: '1234' });
        expect(again.ok).toBe(true);
        expect(again.ok && again.playerId).not.toBe(first.playerId);
        expect(await listPlayers(pool, first.eventId)).toHaveLength(1);
    });
});

describe('signInPlayer', () => {
    it('signs in with the right PIN', async () => {
        const { playerId } = await activeEventWithPlayer('Ola', '1234');
        expect(await signIn('ola', '1234', now)).toEqual({ ok: true, playerId });
    });

    it('refuses a wrong PIN and an unknown nickname with the same answer', async () => {
        await activeEventWithPlayer('Ola', '1234');
        expect(await signIn('ola', '0000', now)).toEqual({ ok: false, error: 'wrong' });
        expect(await signIn('kari', '1234', now)).toEqual({ ok: false, error: 'wrong' });
    });

    it('only finds players in the active event', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        await setActiveEvent(pool, await createEvent(pool, { ...lan, code: 'LAN-2027' }));
        expect(await signIn('ola', '1234', now)).toEqual({ ok: false, error: 'wrong' });
        await clearActiveEvent(pool);
        expect(await signIn('ola', '1234', now)).toEqual({ ok: false, error: 'no-event' });
        expect(eventId).toBeGreaterThan(0);
    });

    it('locks the player for 15 minutes after 5 wrong PINs in a row, even with the right PIN', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) expect((await signIn('ola', '0000', now)).ok).toBe(false);
        const fifth = await signIn('ola', '0000', now);
        expect(fifth).toEqual({ ok: false, error: 'locked', until: new Date(now.getTime() + 15 * 60 * 1000) });
        expect((await signIn('ola', '1234', new Date(now.getTime() + 14 * 60 * 1000))).ok).toBe(false);
        expect((await signIn('ola', '1234', new Date(now.getTime() + 15 * 60 * 1000))).ok).toBe(true);
    });

    it('counts wrong PINs sent at the same time', async () => {
        await activeEventWithPlayer('Ola', '1234');
        await Promise.all(Array.from({ length: 5 }, () => signIn('ola', '0000', now)));
        expect(await signIn('ola', '1234', now)).toMatchObject({ ok: false, error: 'locked' });
    });

    it('needs the wrong PINs in a row', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) await signIn('ola', '0000', now);
        expect((await signIn('ola', '1234', now)).ok).toBe(true);
        for (let i = 0; i < 4; i++) await signIn('ola', '0000', now);
        expect((await signIn('ola', '1234', now)).ok).toBe(true);
    });
});

describe('sessions', () => {
    it('stores only the hash of the token and finds the player by it', async () => {
        const { playerId, eventId } = await activeEventWithPlayer('Ola');
        const { token, expiresAt } = await createSession(pool, playerId, now);
        expect(expiresAt).toEqual(new Date(now.getTime() + SESSION_MS));
        const { rows } = await pool.query('SELECT token_hash FROM player_sessions');
        expect(rows).toHaveLength(1);
        expect(rows[0].token_hash.equals(hashSessionToken(token))).toBe(true);
        expect(rows[0].token_hash.toString('utf8')).not.toContain(token);
        expect(await getSessionPlayer(pool, token, now)).toEqual({ id: playerId, nickname: 'Ola', fozaBalance: 1000, eventId, eventName: lan.name, eventActive: true });
    });

    it('stops working after 7 days', async () => {
        const { playerId } = await activeEventWithPlayer('Ola');
        const { token } = await createSession(pool, playerId, now);
        expect(await getSessionPlayer(pool, token, new Date(now.getTime() + SESSION_MS - 1000))).not.toBeNull();
        expect(await getSessionPlayer(pool, token, new Date(now.getTime() + SESSION_MS))).toBeNull();
        expect((await pool.query('SELECT 1 FROM player_sessions')).rowCount).toBe(0);
    });

    it('is deleted on sign out', async () => {
        const { playerId } = await activeEventWithPlayer('Ola');
        const { token } = await createSession(pool, playerId, now);
        await deleteSession(pool, token);
        expect(await getSessionPlayer(pool, token, now)).toBeNull();
    });

    it('does not find a player for an unknown token', async () => {
        await activeEventWithPlayer('Ola');
        expect(await getSessionPlayer(pool, 'x'.repeat(43), now)).toBeNull();
    });
});

describe('resetPlayerPin', () => {
    it('sets a new PIN, lifts the lock and signs the player out everywhere', async () => {
        const { playerId, eventId } = await activeEventWithPlayer('Ola', '1234');
        const { token } = await createSession(pool, playerId, now);
        for (let i = 0; i < 5; i++) await signIn('ola', '0000', now);
        expect(await resetPlayerPin(pool, playerId, await hashPin('5678'))).toEqual({ eventId });
        expect(await getSessionPlayer(pool, token, now)).toBeNull();
        expect(await signIn('ola', '1234', now)).toEqual({ ok: false, error: 'wrong' });
        expect((await signIn('ola', '5678', now)).ok).toBe(true);
    });

    it('returns null for a player that does not exist', async () => {
        expect(await resetPlayerPin(pool, 999, await hashPin('5678'))).toBeNull();
    });
});

describe('unlockPlayer', () => {
    it('forgets the wrong PINs and lifts the lock, and keeps the PIN and the sessions', async () => {
        const { playerId, eventId } = await activeEventWithPlayer('Ola', '1234');
        const { token } = await createSession(pool, playerId, now);
        for (let i = 0; i < 2; i++) await signIn('ola', '0000');
        expect(await listPlayers(pool, eventId)).toEqual([expect.objectContaining({ failedPinAttempts: 2, lastFailedPinAt: now, lockedUntil: null })]);
        for (let i = 0; i < 3; i++) await signIn('ola', '0000');
        expect(await signIn('ola', '1234')).toMatchObject({ ok: false, error: 'locked' });

        expect(await unlockPlayer(pool, playerId)).toEqual({ eventId });
        expect(await listPlayers(pool, eventId)).toEqual([expect.objectContaining({ failedPinAttempts: 0, lastFailedPinAt: null, lockedUntil: null })]);
        const { rows } = await pool.query('SELECT lock_level FROM players WHERE id = $1', [playerId]);
        expect(rows[0].lock_level).toBe(0);
        expect(await getSessionPlayer(pool, token, now)).not.toBeNull();
        expect(await signIn('ola', '0000')).toEqual({ ok: false, error: 'wrong' });
        expect((await signIn('ola', '1234')).ok).toBe(true);
    });

    it('returns null for a player that does not exist', async () => {
        expect(await unlockPlayer(pool, 999)).toBeNull();
    });
});

describe('the network PIN limit', () => {
    it('shows the busiest client of this hour, and a reset lets every client try PINs again', async () => {
        await activeEventWithPlayer('Ola', '1234');
        expect(await busiestPinClient(pool, now)).toBe(0);
        await setAttempts(pinBucket(client), CLIENT_WRONG_PINS_PER_HOUR);
        await setAttempts(pinBucket('ip:192.0.2.11'), 3);
        await setAttempts(pinBucket(client), 7, new Date(now.getTime() - 60 * MINUTE));
        await setAttempts(client, 9);
        expect(await busiestPinClient(pool, now)).toBe(CLIENT_WRONG_PINS_PER_HOUR);
        expect(await signIn('ola', '1234')).toEqual({ ok: false, error: 'pins' });

        await resetPinLimits(pool);
        expect(await busiestPinClient(pool, now)).toBe(0);
        expect(await readAttempts(pool, client, now)).toBe(9);
        expect((await signIn('ola', '1234')).ok).toBe(true);
    });
});

describe('listPlayers', () => {
    it('lists the players of one event with their Foza', async () => {
        const { eventId } = await activeEventWithPlayer('Ola');
        await signUp({ code: lan.code, nickname: 'Kari', nicknameKey: 'kari', pin: '1111' });
        const players = await listPlayers(pool, eventId);
        expect(players.map((p) => [p.nickname, p.fozaBalance])).toEqual([
            ['Kari', 1000],
            ['Ola', 1000],
        ]);
    });
});

describe('auth_attempts', () => {
    it('counts every bump when many run at the same time', async () => {
        const counts = await Promise.all(Array.from({ length: 50 }, () => bumpAttempts(pool, 'ip:198.51.100.1', now)));
        expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
        expect(await readAttempts(pool, 'ip:198.51.100.1', now)).toBe(50);
    });

    it('lets no more claims through than the limit when many run at the same time', async () => {
        const results = await Promise.all(Array.from({ length: 30 }, () => claimAttempts(pool, [{ bucket: 'ip:198.51.100.2', limit: 5 }], now)));
        expect(results.filter(Boolean)).toHaveLength(5);
        expect(await readAttempts(pool, 'ip:198.51.100.2', now)).toBe(5);
    });

    it('starts a new count in the next hour and deletes rows older than a day', async () => {
        await bumpAttempts(pool, 'ip:198.51.100.3', now);
        expect(await readAttempts(pool, 'ip:198.51.100.3', new Date(now.getTime() + 60 * MINUTE))).toBe(0);
        await bumpAttempts(pool, 'ip:198.51.100.4', new Date(now.getTime() + 26 * 60 * MINUTE));
        expect(await readAttempts(pool, 'ip:198.51.100.3', now)).toBe(0);
    });
});

describe('sign-in limits', () => {
    it('refuses unknown nicknames from a client over its limit, without a PIN check', async () => {
        await activeEventWithPlayer('Ola', '1234');
        await setAttempts(client, CLIENT_FAILURES_PER_HOUR);
        const busy: number[] = [];
        verifyHook.run = () => busy.push(1);
        try {
            expect(await signIn('kari', '1234')).toEqual({ ok: false, error: 'busy' });
        } finally {
            verifyHook.run = null;
        }
        expect(busy).toEqual([]);
        expect(await signIn('kari', '1234', now, 'ip:192.0.2.99')).toEqual({ ok: false, error: 'wrong' });
    });

    it('lets real players on a client that is over its limit still sign in, so a shared address cannot block them', async () => {
        await activeEventWithPlayer('Ola', '1234');
        await setAttempts(client, CLIENT_FAILURES_PER_HOUR);
        expect(await signIn('ola', '0000')).toEqual({ ok: false, error: 'wrong' });
        expect((await signIn('ola', '1234')).ok).toBe(true);
    });

    it('lets a right PIN succeed while the event is over its limit, without touching the event count', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        await setAttempts(eventBucket(eventId), EVENT_FAILURES_PER_HOUR + 50);
        expect((await signIn('ola', '1234')).ok).toBe(true);
        expect(await readAttempts(pool, eventBucket(eventId), now)).toBe(EVENT_FAILURES_PER_HOUR + 50);
    });

    it('keeps counting and checking wrong PINs over the event limit, logs a warning and does not block', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        await setAttempts(eventBucket(eventId), EVENT_FAILURES_PER_HOUR);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(await signIn('ola', '0000')).toEqual({ ok: false, error: 'wrong' });
            expect(await signIn('ola', '0000')).toEqual({ ok: false, error: 'wrong' });
            expect(await readAttempts(pool, eventBucket(eventId), now)).toBe(EVENT_FAILURES_PER_HOUR + 2);
            expect(warn).toHaveBeenCalledTimes(2);
            expect(warn.mock.calls[1][0]).toMatch(new RegExp(`Event ${eventId} has ${EVENT_FAILURES_PER_HOUR + 2} wrong PINs`));
        } finally {
            warn.mockRestore();
        }
        expect((await signIn('ola', '1234')).ok).toBe(true);
    });

    it('does not warn below the event limit', async () => {
        await activeEventWithPlayer('Ola', '1234');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await signIn('ola', '0000');
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('counts unknown nicknames only against the client, wrong PINs only against the event, and right PINs nowhere', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        await signIn('kari', '1234');
        expect(await readAttempts(pool, client, now)).toBe(1);
        expect(await readAttempts(pool, eventBucket(eventId), now)).toBe(0);
        await signIn('ola', '0000');
        expect(await readAttempts(pool, client, now)).toBe(1);
        expect(await readAttempts(pool, eventBucket(eventId), now)).toBe(1);
        await signIn('ola', '1234');
        expect(await readAttempts(pool, client, now)).toBe(1);
        expect(await readAttempts(pool, eventBucket(eventId), now)).toBe(1);
    });

    it('does not count tries against a locked player', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 5; i++) await signIn('ola', '0000');
        expect(await signIn('ola', '1234')).toMatchObject({ ok: false, error: 'locked' });
        expect(await readAttempts(pool, eventBucket(eventId), now)).toBe(5);
    });

    it('locks with an end time when the fifth try is claimed, even if the check never finishes', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) expect((await claimPinAttempt(pool, eventId, 'ola', now))?.lockedUntil).toBeNull();
        const fifth = await claimPinAttempt(pool, eventId, 'ola', now);
        expect(fifth?.lockedUntil).toEqual(new Date(now.getTime() + 15 * MINUTE));
        // The process stops here, before the PIN is checked.
        const { rows } = await pool.query("SELECT failed_pin_attempts, locked_until, lock_level FROM players WHERE nickname_key = 'ola'");
        expect(rows[0]).toEqual({ failed_pin_attempts: 0, locked_until: new Date(now.getTime() + 15 * MINUTE), lock_level: 1 });
        expect(await signIn('ola', '1234')).toEqual({ ok: false, error: 'locked', until: new Date(now.getTime() + 15 * MINUTE) });
        expect((await signIn('ola', '1234', new Date(now.getTime() + 15 * MINUTE))).ok).toBe(true);
    });

    it('clears the lock when the fifth try is the right PIN', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) await signIn('ola', '0000');
        expect((await signIn('ola', '1234')).ok).toBe(true);
        const { rows } = await pool.query("SELECT failed_pin_attempts, locked_until, lock_level FROM players WHERE nickname_key = 'ola'");
        expect(rows[0]).toEqual({ failed_pin_attempts: 0, locked_until: null, lock_level: 0 });
    });

    it('escalates the lock to 15, 30 and 60 minutes, and starts again after a right PIN', async () => {
        await activeEventWithPlayer('Ola', '1234');
        let at = now;
        const lockAt = async () => {
            let result;
            for (let i = 0; i < 5; i++) result = await signIn('ola', '0000', at, `ip:192.0.2.${i}`);
            return result as { until: Date };
        };
        for (const minutes of [15, 30, 60, 60]) {
            const result = await lockAt();
            expect(result).toEqual({ ok: false, error: 'locked', until: new Date(at.getTime() + minutes * MINUTE) });
            at = result.until;
        }
        expect((await signIn('ola', '1234', at)).ok).toBe(true);
        expect((await lockAt()).until).toEqual(new Date(at.getTime() + 15 * MINUTE));
    });

    it('lets no more than 5 PINs be checked when many arrive at the same time', async () => {
        await activeEventWithPlayer('Ola', '1234');
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => signIn('ola', '0000', now, `ip:192.0.2.${i}`)));
        expect(results.filter((r) => !r.ok && r.error === 'wrong')).toHaveLength(4);
        expect(results.filter((r) => !r.ok && r.error === 'locked')).toHaveLength(16);
        expect(await signIn('ola', '1234')).toMatchObject({ ok: false, error: 'locked' });
    });

    it('refuses every PIN from a client over its wrong PIN limit until the hour is over, without a PIN check', async () => {
        await activeEventWithPlayer('Ola', '1234');
        await setAttempts(pinBucket(client), CLIENT_WRONG_PINS_PER_HOUR - 1);
        expect(await signIn('ola', '0000')).toEqual({ ok: false, error: 'wrong' });
        const checks: number[] = [];
        verifyHook.run = () => checks.push(1);
        try {
            expect(await signIn('ola', '1234')).toEqual({ ok: false, error: 'pins' });
        } finally {
            verifyHook.run = null;
        }
        expect(checks).toEqual([]);
        expect(await readAttempts(pool, pinBucket(client), now)).toBe(CLIENT_WRONG_PINS_PER_HOUR);
        expect((await signIn('ola', '1234', now, 'ip:192.0.2.99')).ok).toBe(true);
        expect((await signIn('ola', '1234', new Date(now.getTime() + 60 * MINUTE))).ok).toBe(true);
    });

    it('counts wrong PINs across players against the client, and takes back right PINs and tries on a locked player', async () => {
        await activeEventWithPlayer('Ola', '1234');
        await signUp({ code: lan.code, nickname: 'Kari', nicknameKey: 'kari', pin: '1111' }, 'ip:192.0.2.50');
        await signIn('ola', '0000');
        await signIn('kari', '0000');
        expect(await readAttempts(pool, pinBucket(client), now)).toBe(2);
        expect((await signIn('kari', '1111')).ok).toBe(true);
        expect(await readAttempts(pool, pinBucket(client), now)).toBe(2);
        for (let i = 0; i < 4; i++) await signIn('ola', '0000');
        expect(await readAttempts(pool, pinBucket(client), now)).toBe(6);
        expect(await signIn('ola', '0000')).toMatchObject({ ok: false, error: 'locked' });
        expect(await readAttempts(pool, pinBucket(client), now)).toBe(6);
    });

    it('lets no more wrong PINs through than the client limit when many arrive at the same time', async () => {
        await activeEventWithPlayer('Ola', '1234');
        const nicknames = Array.from({ length: 12 }, (_, i) => `p${i}`);
        for (const nickname of nicknames) await signUp({ code: lan.code, nickname, nicknameKey: nickname, pin: '1111' }, `ip:192.0.2.${100 + Number(nickname.slice(1))}`);
        await setAttempts(pinBucket(client), CLIENT_WRONG_PINS_PER_HOUR - 3);
        const results = await Promise.all(nicknames.map((nickname) => signIn(nickname, '0000')));
        expect(results.filter((r) => !r.ok && r.error === 'wrong')).toHaveLength(3);
        expect(results.filter((r) => !r.ok && r.error === 'pins')).toHaveLength(9);
    });

    it('forgets wrong PINs when the last one is more than a day old', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) await signIn('ola', '0000', now, `ip:192.0.2.${i}`);
        const later = new Date(now.getTime() + 24 * 60 * MINUTE + 1);
        expect(await signIn('ola', '0000', later)).toEqual({ ok: false, error: 'wrong' });
        const { rows } = await pool.query("SELECT failed_pin_attempts, locked_until, last_failed_pin_at FROM players WHERE nickname_key = 'ola'");
        expect(rows[0]).toEqual({ failed_pin_attempts: 1, locked_until: null, last_failed_pin_at: later });
    });

    it('keeps wrong PINs within a day of the last one', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) await signIn('ola', '0000', new Date(now.getTime() + i * 20 * 60 * MINUTE), `ip:192.0.2.${i}`);
        const fifth = new Date(now.getTime() + 80 * 60 * MINUTE);
        expect(await signIn('ola', '0000', fifth)).toEqual({ ok: false, error: 'locked', until: new Date(fifth.getTime() + 15 * MINUTE) });
    });

    it('does not hold a database connection while scrypt runs, for a real or an unknown nickname', async () => {
        await activeEventWithPlayer('Ola', '1234');
        const busy: number[] = [];
        verifyHook.run = () => busy.push(pool.totalCount - pool.idleCount);
        try {
            expect((await signIn('ola', '1234')).ok).toBe(true);
            expect(await signIn('kari', '1234')).toEqual({ ok: false, error: 'wrong' });
        } finally {
            verifyHook.run = null;
        }
        expect(busy).toEqual([0, 0]);
    });
});

describe('sign-up limits', () => {
    const input: SignUpInput = { code: lan.code, nickname: 'Ola', nicknameKey: 'ola', pin: '1234' };

    it('counts wrong codes against the client, and not right codes', async () => {
        await setActiveEvent(pool, await createEvent(pool, lan));
        expect(await signUp({ ...input, code: 'WRONG-CODE' })).toEqual({ ok: false, error: 'code' });
        expect((await signUp(input)).ok).toBe(true);
        expect(await readAttempts(pool, client, now)).toBe(1);
    });

    it('refuses new players from a client over its sign-up limit until the hour is over', async () => {
        await setActiveEvent(pool, await createEvent(pool, lan));
        await setAttempts(signUpBucket(client), CLIENT_SIGN_UPS_PER_HOUR - 1);
        expect((await signUp(input)).ok).toBe(true);
        expect(await signUp({ ...input, nickname: 'Kari', nicknameKey: 'kari' })).toEqual({ ok: false, error: 'sign-ups' });
        expect(await readAttempts(pool, signUpBucket(client), now)).toBe(CLIENT_SIGN_UPS_PER_HOUR);
        expect((await signUp({ ...input, nickname: 'Kari', nicknameKey: 'kari' }, 'ip:192.0.2.99')).ok).toBe(true);
        expect((await signUp({ ...input, nickname: 'Per', nicknameKey: 'per' }, client, new Date(now.getTime() + 60 * MINUTE))).ok).toBe(true);
    });

    it('counts only new players against the sign-up limit', async () => {
        await setActiveEvent(pool, await createEvent(pool, lan));
        expect((await signUp(input)).ok).toBe(true);
        expect(await signUp(input)).toEqual({ ok: false, error: 'taken' });
        expect(await signUp({ ...input, code: 'WRONG-CODE' })).toEqual({ ok: false, error: 'code' });
        expect(await readAttempts(pool, signUpBucket(client), now)).toBe(1);
    });

    it('refuses a client over its limit, even with the right code', async () => {
        await setActiveEvent(pool, await createEvent(pool, lan));
        await setAttempts(client, CLIENT_FAILURES_PER_HOUR);
        expect(await signUp(input)).toEqual({ ok: false, error: 'busy' });
        expect((await signUp(input, 'ip:192.0.2.99')).ok).toBe(true);
    });
});

describe('getSessionPlayer and the active event', () => {
    it('says when the event of the player is no longer active', async () => {
        const { playerId } = await activeEventWithPlayer('Ola');
        const { token } = await createSession(pool, playerId, now);
        expect((await getSessionPlayer(pool, token, now))?.eventActive).toBe(true);
        await clearActiveEvent(pool);
        expect((await getSessionPlayer(pool, token, now))?.eventActive).toBe(false);
    });
});
