import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import { generateBracket } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import { encodeBmp32 } from '@/lib/sponsors/bmp';
import { checkLogo } from '@/lib/sponsors/logo';
import { placeBet } from './bets';
import { getBigScreen } from './big-screen';
import { clearActiveEvent, createEvent, getActiveBigScreenKey, getBigScreenKey, getEvent, rotateBigScreenKey, setActiveEvent, setBigScreenRotation } from './events';
import { addLedger } from './foza';
import { updateLiveScore } from './game-server';
import { callMatch, enterGameResult, listMatches, reportPlayersConnected } from './matches';
import { createSponsor } from './sponsors';
import { saveTournament } from './tournaments';
import { inTransaction } from './transaction';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'JulaLAN', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'OSTAPOPP', startingFoza: 1000, dailyFoza: 0 };
const NOW = new Date('2026-11-20T12:00:00Z');

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

async function addPlayer(eventId: number, nickname: string): Promise<number> {
    return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, created_at, join_code)
             VALUES ($1, $2, $3, '\\x00', '\\x00', 0, $4, $5) RETURNING id`,
            [eventId, nickname, nickname.toLowerCase(), NOW, newJoinCode()],
        );
        await addLedger(client, [{ playerId: rows[0].id, type: 'starting', amount: 1000 }]);
        return rows[0].id;
    });
}

async function setup() {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    const names = ['Blobfisk', 'Skvett', 'Ostebit', 'Kantina'];
    const ids: number[] = [];
    for (const name of names) ids.push(await addPlayer(eventId, name));
    const bracket = generateBracket({ format: 'single_elimination', players: ids, seeding: { method: 'manual', order: ids }, thirdPlaceMatch: false });
    const saved = await saveTournament(pool, eventId, { name: 'Hovedcupen', seeding: 'manual', randomSeed: null, bracket });
    if (!saved.ok) throw new Error(saved.error);
    const [semi1, semi2] = (await listMatches(pool, eventId)).filter((m) => m.tournamentId === saved.id);
    return { eventId, ids, tournamentId: saved.id, semi1, semi2 };
}

describe('getBigScreen', () => {
    it('is empty when no event is active', async () => {
        await createEvent(pool, lan);
        await clearActiveEvent(pool);
        expect(await getBigScreen(pool)).toMatchObject({ eventId: null, featured: null, others: [], bracket: null, boards: [], sponsors: [] });
    });

    it('shows the live match, the odds of the next one, the bracket, the boards and the sponsors', async () => {
        const { eventId, ids, tournamentId, semi1, semi2 } = await setup();
        const [blobfisk, skvett, ostebit, kantina] = ids;
        // semi1 is Blobfisk against Kantina, semi2 Skvett against Ostebit.
        expect(await placeBet(pool, skvett, { matchId: semi1.id, onPlayerId: blobfisk, amount: 300 }, NOW)).toMatchObject({ ok: true });
        expect(await placeBet(pool, ostebit, { matchId: semi1.id, onPlayerId: kantina, amount: 100 }, NOW)).toMatchObject({ ok: true });
        expect(await placeBet(pool, blobfisk, { matchId: semi2.id, onPlayerId: ostebit, amount: 50 }, NOW)).toMatchObject({ ok: true });
        expect(await callMatch(pool, semi1.id)).toMatchObject({ ok: true });
        expect(await reportPlayersConnected(pool, semi1.id)).toMatchObject({ ok: true, started: true });
        expect(await updateLiveScore(pool, { matchId: semi1.id, game: 1, points: [{ playerId: kantina, points: 8 }, { playerId: blobfisk, points: 11 }] }, NOW)).toEqual({ status: 'stored' });

        const logo = await checkLogo(new Uint8Array(await sharp({ create: { width: 60, height: 20, channels: 3, background: '#f6c445' } }).png().toBuffer()));
        if (!logo.ok) throw new Error(logo.error);
        const sponsor = await createSponsor(pool, eventId, { name: 'Pizzabakeren', link: null, enabled: true, gameBackground: null }, logo.value, encodeBmp32(new Uint8Array(32 * 32 * 4), 32, 32));
        if (!sponsor.ok) throw new Error(sponsor.error);
        await createSponsor(pool, eventId, { name: 'Skjult', link: null, enabled: false, gameBackground: null }, logo.value, encodeBmp32(new Uint8Array(32 * 32 * 4), 32, 32));

        const data = await getBigScreen(pool);
        expect(data).toMatchObject({ eventId, eventName: 'JulaLAN' });
        expect(data.featured).toMatchObject({ matchId: semi1.id, state: 'started', label: 'Semifinala, kamp 1', tournamentName: 'Hovedcupen', live: { game: 1, points: [11, 8] }, pool: 400, open: false });
        expect(data.featured!.sides.map((s) => [s.nickname, s.stake, s.elo])).toEqual([
            ['Blobfisk', 300, 1000],
            ['Kantina', 100, 1000],
        ]);
        expect(data.others.map((m) => [m.matchId, m.open, m.pool])).toEqual([[semi2.id, true, 50]]);
        expect(data.bracket).toMatchObject({ tournamentId, name: 'Hovedcupen', rows: 2 });
        expect(data.bracket!.rounds.map((r) => r.name)).toEqual(['Semifinala', 'Finale']);
        expect(data.boards.map((b) => b.key)).toEqual(['rette', 'sigra', 'elo']);
        expect(data.sponsors.map((s) => s.name)).toEqual(['Pizzabakeren']);
        expect(data.sponsors[0].src).toBe(`/api/sponsors/${sponsor.id}/logo?v=${createHash('sha256').update(logo.value.bytes).digest('hex')}`);
        // Nothing but nicknames and numbers leaves the store.
        expect(data.eventCode).toBeNull();
        expect(JSON.stringify(data)).not.toMatch(/OSTAPOPP|join_?code|pin/i);
        // Only a request with the big screen key of the event gets the code.
        const key = (await getBigScreenKey(pool, eventId))!;
        expect((await getBigScreen(pool, null, key)).eventCode).toBe('OSTAPOPP');
        expect((await getBigScreen(pool, null, `${key}x`)).eventCode).toBeNull();
        expect((await getBigScreen(pool, null, '')).eventCode).toBeNull();
    });

    it('counts finished matches and settled bets on the boards, and follows a wanted tournament', async () => {
        const { eventId, ids, semi1 } = await setup();
        const [blobfisk, skvett, , kantina] = ids;
        expect(await placeBet(pool, skvett, { matchId: semi1.id, onPlayerId: blobfisk, amount: 100 }, NOW)).toMatchObject({ ok: true });
        expect(await callMatch(pool, semi1.id)).toMatchObject({ ok: true });
        expect(await reportPlayersConnected(pool, semi1.id)).toMatchObject({ ok: true });
        expect(await enterGameResult(pool, semi1.id, { game: 1, winnerSlot: 1, points1: 15, points2: 4 })).toMatchObject({ ok: true });

        const other = generateBracket({ format: 'single_elimination', players: [blobfisk, kantina], seeding: { method: 'manual', order: [blobfisk, kantina] }, thirdPlaceMatch: false });
        const saved = await saveTournament(pool, eventId, { name: 'Bonuscup', seeding: 'manual', randomSeed: null, bracket: other });
        if (!saved.ok) throw new Error(saved.error);

        const data = await getBigScreen(pool);
        const [rette, sigra, elo] = data.boards;
        expect(rette.rows).toEqual([{ rank: 1, nickname: 'Skvett', value: '1 av 1' }]);
        expect(sigra.rows[0]).toEqual({ rank: 1, nickname: 'Blobfisk', value: '1 siger' });
        expect(elo.rows[0]).toEqual({ rank: 1, nickname: 'Blobfisk', value: '1016' });
        // The newest tournament with a match left is shown by default.
        expect(data.bracket?.name).toBe('Bonuscup');
        expect((await getBigScreen(pool, (await listMatches(pool, eventId))[0].tournamentId)).bracket?.name).toBe('Hovedcupen');
        expect((await getBigScreen(pool, 99_999)).bracket?.name).toBe('Bonuscup');
    });
});

describe('the other screens', () => {
    it('are empty before anything is played, with the overview alone in the rotation', async () => {
        await setup();
        const data = await getBigScreen(pool);
        expect(data.rotation).toEqual({ screens: ['overview'], seconds: 60 });
        expect(data.facts).toEqual([]);
        expect(data.winner).toBeNull();
        expect(data.foza).toEqual({ bettors: [], wins: [] });
        expect(data.upNext.map((m) => m.label)).toEqual(['Semifinala, kamp 1', 'Semifinala, kamp 2']);
        expect(data.fullBracket!.sections[0].rounds.map((r) => r.name)).toEqual(['Semifinala', 'Finale']);
    });

    it('show the records, the best bettors and the champion once the tournament is played', async () => {
        const { ids, semi1, semi2 } = await setup();
        const [blobfisk, skvett, ostebit] = ids;
        expect(await placeBet(pool, ostebit, { matchId: semi1.id, onPlayerId: blobfisk, amount: 100 }, NOW)).toMatchObject({ ok: true });
        expect(await placeBet(pool, skvett, { matchId: semi1.id, onPlayerId: ids[3], amount: 300 }, NOW)).toMatchObject({ ok: true });
        // semi1: Blobfisk wins 15-0 in one game. semi2: Ostebit comes back from 0-1 against Skvett.
        for (const m of [semi1, semi2]) expect(await callMatch(pool, m.id)).toMatchObject({ ok: true });
        expect(await enterGameResult(pool, semi1.id, { game: 1, winnerSlot: 1, points1: 15, points2: 0 })).toMatchObject({ ok: true });
        for (const [game, winnerSlot, points1, points2] of [
            [1, 1, 15, 12],
            [2, 2, 9, 15],
            [3, 2, 13, 15],
        ] as const) {
            expect(await enterGameResult(pool, semi2.id, { game, winnerSlot, points1, points2 })).toMatchObject({ ok: true });
        }
        // A hand-entered match has no real length, so the store times this one from the database.
        await pool.query(`UPDATE matches SET started_at = finished_at - interval '23 minutes' WHERE id = $1`, [semi2.id]);

        let data = await getBigScreen(pool);
        expect(data.winner).toBeNull();
        expect(data.facts).toEqual([
            { key: 'wins', label: 'Flest sigra', value: '1 siger', who: expect.any(String) },
            { key: 'biggestWin', label: 'Største siger i eit sett', value: '15–0', who: 'Blobfisk mot Kantina' },
            { key: 'comeback', label: 'Største snuoperasjon', value: '0–1 te 2–1', who: 'Ostebit mot Skvett' },
            { key: 'longest', label: 'Lengste kamp', value: '23 min', who: 'Ostebit mot Skvett' },
            { key: 'points', label: 'Flest poeng', value: '43 poeng', who: 'Ostebit' },
        ]);
        expect(data.foza.bettors.map((b) => [b.nickname, b.net])).toEqual([
            ['Ostebit', 300],
            ['Skvett', -300],
        ]);
        expect(data.foza.wins).toEqual([{ nickname: 'Ostebit', on: 'Blobfisk', profit: 300 }]);

        const final = (await listMatches(pool, semi1.eventId)).find((m) => m.bracketRound?.round === 2)!;
        expect(await callMatch(pool, final.id)).toMatchObject({ ok: true });
        expect(await enterGameResult(pool, final.id, { game: 1, winnerSlot: 2, points1: 7, points2: 15 })).toMatchObject({ ok: true });
        data = await getBigScreen(pool);
        expect(data.winner).toEqual({
            tournamentId: expect.any(Number),
            tournamentName: 'Hovedcupen',
            champion: 'Ostebit',
            podium: [
                { place: 2, names: ['Blobfisk'] },
                { place: 3, names: expect.arrayContaining(['Skvett', 'Kantina']) },
            ],
            final: { round: 'Finale', sides: [{ name: 'Blobfisk', score: 0 }, { name: 'Ostebit', score: 1 }] },
        });
        expect(JSON.stringify(data)).not.toMatch(/OSTAPOPP|join_?code|pin/i);
    });

    it('follow the rotation the admin saved, and the database refuses a bad one', async () => {
        const { eventId } = await setup();
        expect(await setBigScreenRotation(pool, eventId, { screens: ['stats', 'overview', 'winner'], seconds: 15 })).toBe(true);
        expect((await getBigScreen(pool)).rotation).toEqual({ screens: ['stats', 'overview', 'winner'], seconds: 15 });
        expect((await getEvent(pool, eventId))!.bigScreen).toEqual({ screens: ['stats', 'overview', 'winner'], seconds: 15 });
        expect(await setBigScreenRotation(pool, 999_999, { screens: ['overview'], seconds: 60 })).toBe(false);
        await expect(setBigScreenRotation(pool, eventId, { screens: ['overview'], seconds: 9 })).rejects.toThrow(/big_screen_seconds_check/);
        await expect(setBigScreenRotation(pool, eventId, { screens: ['overview'], seconds: 601 })).rejects.toThrow(/big_screen_seconds_check/);
        await expect(pool.query(`UPDATE events SET big_screen_screens = ARRAY['tetris'] WHERE id = $1`, [eventId])).rejects.toThrow(/big_screen_screens_check/);
        await expect(pool.query(`UPDATE events SET big_screen_screens = ARRAY[]::text[] WHERE id = $1`, [eventId])).rejects.toThrow(/big_screen_screens_check/);
    });

    it('start with the overview alone for every event from before the migration', async () => {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            for (const { name } of readMigrations().filter((m) => m.name < '0016')) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
            await migrate(pool, dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        const id = await createEvent(pool, lan);
        expect(await migrate(pool)).toContain('0016_big_screen_rotation.sql');
        expect((await getEvent(pool, id))!.bigScreen).toEqual({ screens: ['overview'], seconds: 60 });
    });
});

const KEY = /^[A-Za-z0-9_-]{43}$/;

describe('the big screen key', () => {
    it('is made for each new event, unique and URL-safe', async () => {
        const ids = await Promise.all(Array.from({ length: 20 }, () => createEvent(pool, lan)));
        const keys = await Promise.all(ids.map((id) => getBigScreenKey(pool, id)));
        expect(keys.every((key) => KEY.test(key!))).toBe(true);
        expect(new Set(keys).size).toBe(20);
        expect(await getBigScreenKey(pool, 999_999)).toBeNull();
    });

    it('is refused by the database when it is not a valid key or is taken', async () => {
        const [a, b] = [await createEvent(pool, lan), await createEvent(pool, lan)];
        await expect(pool.query("UPDATE events SET big_screen_key = 'short' WHERE id = $1", [a])).rejects.toThrow(/events_big_screen_key_check/);
        await expect(pool.query('UPDATE events SET big_screen_key = (SELECT big_screen_key FROM events WHERE id = $2) WHERE id = $1', [a, b])).rejects.toThrow(/events_big_screen_key_key/);
    });

    it('belongs to the active event, so the key of another event shows no code', async () => {
        const [a, b] = [await createEvent(pool, lan), await createEvent(pool, lan)];
        expect(await getActiveBigScreenKey(pool)).toBeNull();
        await setActiveEvent(pool, a);
        expect(await getActiveBigScreenKey(pool)).toBe(await getBigScreenKey(pool, a));
        expect((await getBigScreen(pool, null, await getBigScreenKey(pool, b))).eventCode).toBeNull();
        expect((await getBigScreen(pool, null, await getBigScreenKey(pool, a))).eventCode).toBe('OSTAPOPP');
    });

    it('is replaced by a new one, and the old one stops showing the code', async () => {
        const [a, b] = [await createEvent(pool, lan), await createEvent(pool, lan)];
        await setActiveEvent(pool, a);
        const old = (await getBigScreenKey(pool, a))!;
        const other = await getBigScreenKey(pool, b);
        expect(await rotateBigScreenKey(pool, a)).toBe(true);
        const fresh = (await getBigScreenKey(pool, a))!;
        expect(fresh).toMatch(KEY);
        expect(fresh).not.toBe(old);
        expect(await getBigScreenKey(pool, b)).toBe(other);
        expect((await getBigScreen(pool, null, old)).eventCode).toBeNull();
        expect((await getBigScreen(pool, null, fresh)).eventCode).toBe('OSTAPOPP');
        expect(await rotateBigScreenKey(pool, 999_999)).toBe(false);
    });

    it('is given to every event from before the migration, each its own', async () => {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            for (const { name } of readMigrations().filter((m) => m.name < '0011')) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
            await migrate(pool, dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        await pool.query(
            `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza)
             SELECT 'LAN ' || n, '2026-11-20', '2026-11-22', 'LAN-2026', 0, 0 FROM generate_series(1, 50) AS n`,
        );
        expect(await migrate(pool)).toContain('0011_big_screen_key.sql');
        const { rows } = await pool.query<{ big_screen_key: string }>('SELECT big_screen_key FROM events');
        expect(rows).toHaveLength(50);
        expect(rows.every((row) => KEY.test(row.big_screen_key))).toBe(true);
        expect(new Set(rows.map((row) => row.big_screen_key)).size).toBe(50);
    });
});
