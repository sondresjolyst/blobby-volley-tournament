import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, readMigrations } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { hashPin } from '@/lib/players/pin';
import { hashSessionToken, SESSION_MS } from '@/lib/players/session';
import { clearActiveEvent, createEvent, getActiveEvent, getEvent, listEvents, setActiveEvent, updateEvent } from './events';
import { createSession, deleteSession, getSessionPlayer, listPlayers, resetPlayerPin, signInPlayer, signUpPlayer } from './players';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const lastYear: EventInput = { name: 'LAN 2025', startsOn: '2025-11-21', endsOn: '2025-11-23', code: 'LAN-2025', startingFoza: 500, dailyFoza: 50 };
const now = new Date('2026-11-20T18:00:00Z');

async function activeEventWithPlayer(nickname = 'Ola', pin = '1234') {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    const result = await signUpPlayer(pool, { code: lan.code, nickname, nicknameKey: nickname.toLowerCase(), pin: await hashPin(pin) });
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
            pool.query('INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance) VALUES ($1, $2, $3, $4, $5, 0)', [eventId, nickname, `k${n++}`, pin.hash, pin.salt]);
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
        expect(await getEvent(pool, id)).toEqual({ id, ...lan, isActive: false });
        expect(await updateEvent(pool, id, { ...lan, name: 'LAN 2026 B', dailyFoza: 150 })).toBe(true);
        expect(await getEvent(pool, id)).toMatchObject({ name: 'LAN 2026 B', dailyFoza: 150 });
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
        const pin = await hashPin('1234');
        const input = { code: lan.code, nickname: 'Ola', nicknameKey: 'ola', pin };
        expect(await signUpPlayer(pool, input)).toEqual({ ok: false, error: 'no-event' });
        await setActiveEvent(pool, await createEvent(pool, lan));
        expect(await signUpPlayer(pool, { ...input, code: 'LAN-2025' })).toEqual({ ok: false, error: 'code' });
    });

    it('refuses a code from another, inactive event', async () => {
        await createEvent(pool, lastYear);
        await setActiveEvent(pool, await createEvent(pool, lan));
        expect(await signUpPlayer(pool, { code: lastYear.code, nickname: 'Ola', nicknameKey: 'ola', pin: await hashPin('1234') })).toEqual({ ok: false, error: 'code' });
    });

    it('keeps nicknames unique per event, ignoring case', async () => {
        await activeEventWithPlayer('Ola');
        expect(await signUpPlayer(pool, { code: lan.code, nickname: 'OLA', nicknameKey: 'ola', pin: await hashPin('9999') })).toEqual({ ok: false, error: 'taken' });
    });

    it('lets the same nickname sign up again in a new event as a new player', async () => {
        const first = await activeEventWithPlayer('Ola');
        const next = await createEvent(pool, { ...lan, name: 'LAN 2027', code: 'LAN-2027' });
        await setActiveEvent(pool, next);
        const again = await signUpPlayer(pool, { code: 'LAN-2027', nickname: 'Ola', nicknameKey: 'ola', pin: await hashPin('1234') });
        expect(again.ok).toBe(true);
        expect(again.ok && again.playerId).not.toBe(first.playerId);
        expect(await listPlayers(pool, first.eventId)).toHaveLength(1);
    });
});

describe('signInPlayer', () => {
    it('signs in with the right PIN', async () => {
        const { playerId } = await activeEventWithPlayer('Ola', '1234');
        expect(await signInPlayer(pool, 'ola', '1234', now)).toEqual({ ok: true, playerId });
    });

    it('refuses a wrong PIN and an unknown nickname with the same answer', async () => {
        await activeEventWithPlayer('Ola', '1234');
        expect(await signInPlayer(pool, 'ola', '0000', now)).toEqual({ ok: false, error: 'wrong' });
        expect(await signInPlayer(pool, 'kari', '1234', now)).toEqual({ ok: false, error: 'wrong' });
    });

    it('only finds players in the active event', async () => {
        const { eventId } = await activeEventWithPlayer('Ola', '1234');
        await setActiveEvent(pool, await createEvent(pool, { ...lan, code: 'LAN-2027' }));
        expect(await signInPlayer(pool, 'ola', '1234', now)).toEqual({ ok: false, error: 'wrong' });
        await clearActiveEvent(pool);
        expect(await signInPlayer(pool, 'ola', '1234', now)).toEqual({ ok: false, error: 'no-event' });
        expect(eventId).toBeGreaterThan(0);
    });

    it('locks the player for 15 minutes after 5 wrong PINs in a row, even with the right PIN', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) expect((await signInPlayer(pool, 'ola', '0000', now)).ok).toBe(false);
        const fifth = await signInPlayer(pool, 'ola', '0000', now);
        expect(fifth).toEqual({ ok: false, error: 'locked', until: new Date(now.getTime() + 15 * 60 * 1000) });
        expect((await signInPlayer(pool, 'ola', '1234', new Date(now.getTime() + 14 * 60 * 1000))).ok).toBe(false);
        expect((await signInPlayer(pool, 'ola', '1234', new Date(now.getTime() + 15 * 60 * 1000))).ok).toBe(true);
    });

    it('counts wrong PINs sent at the same time', async () => {
        await activeEventWithPlayer('Ola', '1234');
        await Promise.all(Array.from({ length: 5 }, () => signInPlayer(pool, 'ola', '0000', now)));
        expect(await signInPlayer(pool, 'ola', '1234', now)).toMatchObject({ ok: false, error: 'locked' });
    });

    it('needs the wrong PINs in a row', async () => {
        await activeEventWithPlayer('Ola', '1234');
        for (let i = 0; i < 4; i++) await signInPlayer(pool, 'ola', '0000', now);
        expect((await signInPlayer(pool, 'ola', '1234', now)).ok).toBe(true);
        for (let i = 0; i < 4; i++) await signInPlayer(pool, 'ola', '0000', now);
        expect((await signInPlayer(pool, 'ola', '1234', now)).ok).toBe(true);
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
        expect(await getSessionPlayer(pool, token, now)).toEqual({ id: playerId, nickname: 'Ola', fozaBalance: 1000, eventId, eventName: lan.name });
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
        for (let i = 0; i < 5; i++) await signInPlayer(pool, 'ola', '0000', now);
        expect(await resetPlayerPin(pool, playerId, await hashPin('5678'))).toEqual({ eventId });
        expect(await getSessionPlayer(pool, token, now)).toBeNull();
        expect(await signInPlayer(pool, 'ola', '1234', now)).toEqual({ ok: false, error: 'wrong' });
        expect((await signInPlayer(pool, 'ola', '5678', now)).ok).toBe(true);
    });

    it('returns null for a player that does not exist', async () => {
        expect(await resetPlayerPin(pool, 999, await hashPin('5678'))).toBeNull();
    });
});

describe('listPlayers', () => {
    it('lists the players of one event with their Foza', async () => {
        const { eventId } = await activeEventWithPlayer('Ola');
        await signUpPlayer(pool, { code: lan.code, nickname: 'Kari', nicknameKey: 'kari', pin: await hashPin('1111') });
        const players = await listPlayers(pool, eventId);
        expect(players.map((p) => [p.nickname, p.fozaBalance])).toEqual([
            ['Kari', 1000],
            ['Ola', 1000],
        ]);
    });
});
