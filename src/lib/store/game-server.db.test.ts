import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import { generateBracket } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { isJoinCode, newJoinCode } from '@/lib/players/join-code';
import { createEvent, setActiveEvent } from './events';
import { getLiveScore, getServerSync, updateLiveScore } from './game-server';
import { callMatch, createChallenge, acceptChallenge, enterGameResult, getMatch, listMatches, reportPlayersConnected, reportServerGame, resetMatch, restartCurrentGame, type ServerGameReport } from './matches';
import { rotateJoinCode, signUpPlayer } from './players';
import { getTournament, saveTournament } from './tournaments';

// Lets a test choose the next codes drawn. Without a choice the real generator runs.
const codes = vi.hoisted(() => ({ next: [] as string[] }));
vi.mock('@/lib/players/join-code', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/players/join-code')>();
    return { ...actual, newJoinCode: () => codes.next.shift() ?? actual.newJoinCode() };
});

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };
const NOW = new Date('2026-11-20T18:00:00Z');

beforeEach(async () => {
    codes.next = [];
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

let uuidCounter = 0;
const nextUuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`;

async function addPlayers(eventId: number, count: number, prefix = 'P'): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 1; i <= count; i++) {
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code)
             VALUES ($1, $2, $3, '\\x00', '\\x00', 0, $4) RETURNING id`,
            [eventId, `${prefix}${i}`, `${prefix.toLowerCase()}${i}`, newJoinCode()],
        );
        ids.push(rows[0].id);
    }
    return ids;
}

const codeOf = async (playerId: number) => (await pool.query<{ join_code: string }>('SELECT join_code FROM players WHERE id = $1', [playerId])).rows[0].join_code;

/** An active event with a tournament of 4 players. Returns its matches in play order. */
async function setup(options: { scoreToWin?: number; speed?: number; bestOf?: 1 | 3 } = {}) {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    const players = await addPlayers(eventId, 4);
    const planned = generateBracket({ format: 'single_elimination', players, seeding: { method: 'manual', order: players }, thirdPlaceMatch: false });
    const rounds = Object.fromEntries(planned.rounds.map((r) => [r.key, { bestOf: options.bestOf ?? 3, ruleFile: r.key === 'final-1' ? 'final.lua' : 'default.lua' }]));
    const bracket = generateBracket({ format: 'single_elimination', players, seeding: { method: 'manual', order: players }, thirdPlaceMatch: false, rounds });
    const saved = await saveTournament(pool, eventId, { name: 'Cup', seeding: 'manual', randomSeed: null, bracket, scoreToWin: options.scoreToWin, speed: options.speed });
    if (!saved.ok) throw new Error(saved.error);
    const ids = (await listMatches(pool, eventId)).map((m) => m.id);
    return { eventId, players, tournamentId: saved.id, ids };
}

const serverReport = (matchId: number, game: number, winnerId: number | null, points: [number, number, number, number], reportId = nextUuid()): ServerGameReport => ({
    reportId,
    matchId,
    game,
    winnerId,
    points: [
        { playerId: points[0], points: points[1] },
        { playerId: points[2], points: points[3] },
    ],
    startedAt: new Date('2026-11-20T18:00:00Z'),
    endedAt: new Date('2026-11-20T18:05:00Z'),
});

describe('join codes', () => {
    it('gives a player a code at sign-up', async () => {
        const eventId = await createEvent(pool, lan);
        await setActiveEvent(pool, eventId);
        const result = await signUpPlayer(pool, { code: lan.code, nickname: 'Ola', nicknameKey: 'ola', pin: '1234' }, 'ip:192.0.2.1', NOW);
        if (!result.ok) throw new Error(result.error);
        expect(isJoinCode(await codeOf(result.playerId))).toBe(true);
    });

    it('refuses a player without a code, a code of the wrong form and the same code twice in one event', async () => {
        const first = await createEvent(pool, lan);
        const second = await createEvent(pool, { ...lan, name: 'LAN 2027', code: 'LAN-2027' });
        const insert = (eventId: number, key: string, code: string | null) =>
            pool.query(`INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code) VALUES ($1, $2, $2, '\\x00', '\\x00', 0, $3)`, [eventId, key, code]);
        await expect(insert(first, 'a', null)).rejects.toThrow(/join_code/);
        await expect(insert(first, 'a', 'ABCDEFGHJ0')).rejects.toThrow(/players_join_code_check/);
        await expect(insert(first, 'a', 'abcdefghjk')).rejects.toThrow(/players_join_code_check/);
        await insert(first, 'a', 'ABCDEFGHJK');
        await expect(insert(first, 'b', 'ABCDEFGHJK')).rejects.toThrow(/players_event_id_join_code_key/);
        // Another event may use the same code.
        await insert(second, 'a', 'ABCDEFGHJK');
    });

    it('signs up again with a new code when the first one is taken in the event', async () => {
        const eventId = await createEvent(pool, lan);
        await setActiveEvent(pool, eventId);
        const [taken] = await addPlayers(eventId, 1);
        const code = await codeOf(taken);
        // The first code drawn is the taken one, so the sign-up must draw again.
        codes.next.push(code);
        const result = await signUpPlayer(pool, { code: lan.code, nickname: 'Kari', nicknameKey: 'kari', pin: '1234' }, 'ip:192.0.2.1', NOW);
        if (!result.ok) throw new Error(result.error);
        expect(codes.next).toEqual([]);
        const got = await codeOf(result.playerId);
        expect(isJoinCode(got)).toBe(true);
        expect(got).not.toBe(code);
    });

    it('rotates again when the new code is taken', async () => {
        const eventId = await createEvent(pool, lan);
        const [first, second] = await addPlayers(eventId, 2);
        const taken = await codeOf(second);
        codes.next.push(taken);
        expect(await rotateJoinCode(pool, first)).toEqual({ eventId });
        expect(codes.next).toEqual([]);
        expect(await codeOf(first)).not.toBe(taken);
        expect(await codeOf(second)).toBe(taken);
    });

    it('rotates a code to a new one and stops the old one in the sync', async () => {
        const { players } = await setup();
        const before = await codeOf(players[0]);
        const sync = await getServerSync(pool, NOW);
        expect(await rotateJoinCode(pool, players[0])).toEqual({ eventId: expect.any(Number) });
        const after = await codeOf(players[0]);
        expect(isJoinCode(after)).toBe(true);
        expect(after).not.toBe(before);
        const next = await getServerSync(pool, NOW);
        expect(next.players.find((p) => p.playerId === players[0])!.code).toBe(after);
        expect(next.players.some((p) => p.code === before)).toBe(false);
        expect(next.syncVersion).not.toBe(sync.syncVersion);
        expect(await rotateJoinCode(pool, 999999)).toBeNull();
    });

    it('gives every player from before the migration a different valid code', async () => {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            for (const { name } of readMigrations().filter((m) => m.name < '0007')) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
            await migrate(pool, dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        const eventId = (
            await pool.query<{ id: number }>(
                `INSERT INTO events (name, starts_on, ends_on, code, starting_foza, daily_foza) VALUES ('LAN 2026', '2026-11-20', '2026-11-22', 'LAN-2026', 0, 0) RETURNING id`,
            )
        ).rows[0].id;
        await pool.query(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance)
             SELECT $1, 'P' || n, 'p' || n, '\\x00', '\\x00', 0 FROM generate_series(1, 200) AS n`,
            [eventId],
        );
        expect(await migrate(pool)).toEqual(['0007_game_server.sql']);
        const { rows } = await pool.query<{ join_code: string }>('SELECT join_code FROM players');
        expect(rows).toHaveLength(200);
        expect(rows.every((row) => isJoinCode(row.join_code))).toBe(true);
        expect(new Set(rows.map((row) => row.join_code)).size).toBe(200);
        // Each of the 31 characters shows up across 2000 characters.
        expect(new Set(rows.map((row) => row.join_code).join('')).size).toBe(31);
    });
});

describe('score to win and game speed', () => {
    it('default to 15 and 75, and a tournament passes its own to every match', async () => {
        const plain = await setup();
        expect((await getTournament(pool, plain.tournamentId))!).toMatchObject({ scoreToWin: 15, speed: 75 });
        expect((await getMatch(pool, plain.ids[0]))!).toMatchObject({ scoreToWin: 15, speed: 75 });

        const fast = await saveTournament(pool, plain.eventId, {
            name: 'Fast cup',
            seeding: 'manual',
            randomSeed: null,
            bracket: generateBracket({ format: 'single_elimination', players: plain.players.slice(0, 2), seeding: { method: 'manual', order: plain.players.slice(0, 2) }, thirdPlaceMatch: false }),
            scoreToWin: 21,
            speed: 100,
        });
        if (!fast.ok) throw new Error(fast.error);
        expect((await getTournament(pool, fast.id))!).toMatchObject({ scoreToWin: 21, speed: 100 });
        const match = (await listMatches(pool, plain.eventId)).find((m) => m.tournamentId === fast.id)!;
        expect(match).toMatchObject({ scoreToWin: 21, speed: 100 });
    });

    it('are set on a 1v1 match and checked', async () => {
        const { players } = await setup();
        const made = await createChallenge(pool, players[0], players[1], { scoreToWin: 10, speed: 60 });
        if (!made.ok) throw new Error(made.error);
        expect((await getMatch(pool, made.matchId))!).toMatchObject({ scoreToWin: 10, speed: 60 });
        expect(await createChallenge(pool, players[2], players[3], { scoreToWin: 0 })).toEqual({ ok: false, error: 'settings' });
        expect(await createChallenge(pool, players[2], players[3], { speed: 121 })).toEqual({ ok: false, error: 'settings' });
        const plain = await createChallenge(pool, players[2], players[3]);
        if (!plain.ok) throw new Error(plain.error);
        expect((await getMatch(pool, plain.matchId))!).toMatchObject({ scoreToWin: 15, speed: 75 });
    });
});

describe('getServerSync', () => {
    it('has no event, players or matches when no event is active', async () => {
        const sync = await getServerSync(pool, NOW);
        expect(sync).toMatchObject({ serverTime: NOW.toISOString(), eventId: null, players: [], matches: [] });
        expect(sync.syncVersion).toMatch(/^[0-9a-f]{16}$/);
    });

    it('lists every player of the active event and only the called and started matches', async () => {
        const s = await setup({ scoreToWin: 21, speed: 90 });
        // Players of an event that is not active stay out.
        const other = await createEvent(pool, { ...lan, name: 'Old LAN', code: 'OLD-LAN-1' });
        await addPlayers(other, 2, 'Old');
        const [m1, m2, final] = s.ids;
        expect(await callMatch(pool, m1)).toMatchObject({ ok: true });
        expect(await callMatch(pool, m2)).toMatchObject({ ok: true });
        expect(await reportPlayersConnected(pool, m2)).toMatchObject({ ok: true, started: true });

        const sync = await getServerSync(pool, NOW);
        expect(sync.eventId).toBe(s.eventId);
        expect(sync.players).toEqual(await Promise.all(s.players.map(async (id, i) => ({ playerId: id, nickname: `P${i + 1}`, code: await codeOf(id) }))));
        expect(sync.matches).toEqual([
            {
                matchId: m1,
                state: 'called',
                bestOf: 3,
                nextGame: 1,
                ruleFile: 'default.lua',
                scoreToWin: 21,
                speed: 90,
                awaitingDecision: false,
                players: [
                    { playerId: s.players[0], code: await codeOf(s.players[0]) },
                    { playerId: s.players[3], code: await codeOf(s.players[3]) },
                ],
            },
            expect.objectContaining({ matchId: m2, state: 'started', nextGame: 1 }),
        ]);
        expect(sync.matches.some((m) => m.matchId === final)).toBe(false);
    });

    it('drops a match once it is finished, and keeps the version while nothing changes', async () => {
        const s = await setup({ bestOf: 1 });
        const [m1] = s.ids;
        const empty = await getServerSync(pool, NOW);
        expect((await getServerSync(pool, new Date(NOW.getTime() + 60_000))).syncVersion).toBe(empty.syncVersion);
        await callMatch(pool, m1);
        const called = await getServerSync(pool, NOW);
        expect(called.syncVersion).not.toBe(empty.syncVersion);
        expect(called.matches.map((m) => m.matchId)).toEqual([m1]);
        expect(await reportServerGame(pool, serverReport(m1, 1, s.players[0], [s.players[0], 15, s.players[3], 4]))).toMatchObject({ ok: true, status: 'applied' });
        const done = await getServerSync(pool, NOW);
        expect(done.matches).toEqual([]);
        expect(done.syncVersion).not.toBe(called.syncVersion);
    });

    it('moves the next game on and marks an abandoned game that waits for the admin', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        await callMatch(pool, m1);
        await reportServerGame(pool, serverReport(m1, 1, a, [a, 15, b, 3]));
        expect((await getServerSync(pool, NOW)).matches[0]).toMatchObject({ state: 'started', nextGame: 2, awaitingDecision: false });
        await reportServerGame(pool, serverReport(m1, 2, null, [a, 4, b, 6]));
        expect((await getServerSync(pool, NOW)).matches[0]).toMatchObject({ nextGame: 3, awaitingDecision: true });
        expect(await restartCurrentGame(pool, m1)).toMatchObject({ ok: true, nextGame: 3 });
        expect((await getServerSync(pool, NOW)).matches[0]).toMatchObject({ nextGame: 3, awaitingDecision: false });
        expect((await getMatch(pool, m1))!.nextGame).toBe(3);
    });
});

describe('reportPlayersConnected from the game server', () => {
    it('starts a called match once, and a repeat changes nothing', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const players = [s.players[3], s.players[0]];
        await callMatch(pool, m1);
        expect(await reportPlayersConnected(pool, m1, players)).toMatchObject({ ok: true, started: true, events: [{ type: 'started', matchId: m1 }] });
        const startedAt = (await getMatch(pool, m1))!.startedAt;
        expect(await reportPlayersConnected(pool, m1, players)).toMatchObject({ ok: true, started: false, events: [] });
        expect((await getMatch(pool, m1))!).toMatchObject({ state: 'started', startedAt });
    });

    it('refuses players who are not the two of the match, and a match that is not called', async () => {
        const s = await setup();
        const [m1, m2] = s.ids;
        await callMatch(pool, m1);
        expect(await reportPlayersConnected(pool, m1, [s.players[0], s.players[1]])).toEqual({ ok: false, error: 'players' });
        expect((await getMatch(pool, m1))!.state).toBe('called');
        expect(await reportPlayersConnected(pool, m2, [s.players[1], s.players[2]])).toEqual({ ok: false, error: 'state' });
        expect(await reportPlayersConnected(pool, 999999, [s.players[1], s.players[2]])).toEqual({ ok: false, error: 'not-found' });
    });
});

describe('reportServerGame', () => {
    it('stores a report once by its id and keeps the times', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        await callMatch(pool, m1);
        // Points come in any order. The winner is given by player id.
        const report = serverReport(m1, 1, b, [b, 15, a, 12]);
        expect(await reportServerGame(pool, report)).toMatchObject({ ok: true, status: 'applied' });
        expect(await reportServerGame(pool, report)).toMatchObject({ ok: true, status: 'duplicate' });
        // The same id with other content is still a duplicate.
        expect(await reportServerGame(pool, { ...report, game: 2, winnerId: a, points: [{ playerId: a, points: 15 }, { playerId: b, points: 0 }] })).toMatchObject({ ok: true, status: 'duplicate' });
        // Even with players that would be refused, a known id answers duplicate.
        expect(await reportServerGame(pool, { ...report, winnerId: s.players[1], points: [{ playerId: s.players[1], points: 15 }, { playerId: b, points: 0 }] })).toMatchObject({ ok: true, status: 'duplicate' });
        const match = (await getMatch(pool, m1))!;
        expect(match).toMatchObject({ state: 'started', score1: 0, score2: 1, nextGame: 2 });
        expect(match.games).toEqual([{ number: 1, status: 'finished', winnerSlot: 2, points1: 12, points2: 15, source: 'server' }]);
        const stored = await pool.query('SELECT game_number, winner_slot, points1, points2, outcome, started_at, ended_at FROM game_reports WHERE report_id = $1', [report.reportId]);
        expect(stored.rows).toEqual([{ game_number: 1, winner_slot: 2, points1: 12, points2: 15, outcome: 'applied', started_at: report.startedAt, ended_at: report.endedAt }]);
    });

    it('stores two reports with the same id that arrive at the same time once', async () => {
        const s = await setup();
        const [m1] = s.ids;
        await callMatch(pool, m1);
        const report = serverReport(m1, 1, s.players[0], [s.players[0], 15, s.players[3], 2]);
        const results = await Promise.all([reportServerGame(pool, report), reportServerGame(pool, report), reportServerGame(pool, report)]);
        expect(results.map((r) => (r.ok ? r.status : r.error)).sort()).toEqual(['applied', 'duplicate', 'duplicate']);
        expect((await getMatch(pool, m1))!.games).toHaveLength(1);
    });

    it('stores one report id once, even when it comes for two matches at the same time', async () => {
        const s = await setup();
        const [m1, m2] = s.ids;
        await callMatch(pool, m1);
        await callMatch(pool, m2);
        const reportId = nextUuid();
        // Another transaction holds the id for match 1 and has not committed, so the check before
        // the insert cannot see it. The insert for match 2 must wait for it and then find it.
        const other = await pool.connect();
        try {
            await other.query('BEGIN');
            await other.query(`INSERT INTO game_reports (report_id, match_id, game_number, points1, points2, outcome, reason) VALUES ($1, $2, 1, 0, 0, 'ignored', 'state')`, [reportId, m1]);
            const pending = reportServerGame(pool, serverReport(m2, 1, s.players[1], [s.players[1], 15, s.players[2], 2], reportId));
            for (let i = 0; i < 100; i++) {
                const waiting = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'INSERT INTO game_reports%'`);
                if (waiting.rows[0].n > 0) break;
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            await other.query('COMMIT');
            expect(await pending).toMatchObject({ ok: true, status: 'duplicate' });
        } finally {
            other.release();
        }
        expect((await getMatch(pool, m2))!.games).toEqual([]);
    });

    it('keeps a late report after an admin result, but it changes nothing', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        await callMatch(pool, m1);
        expect(await enterGameResult(pool, m1, { game: 1, winnerSlot: 2, points1: 5, points2: 15 })).toMatchObject({ ok: true });
        expect(await reportServerGame(pool, serverReport(m1, 1, a, [a, 15, b, 9]))).toMatchObject({ ok: true, status: 'ignored', reason: 'game-closed' });
        expect((await getMatch(pool, m1))!.games).toEqual([{ number: 1, status: 'finished', winnerSlot: 2, points1: 5, points2: 15, source: 'admin' }]);
        // A report for a game the admin cleared with a reset is closed too.
        expect(await resetMatch(pool, m1)).toMatchObject({ ok: true });
        await callMatch(pool, m1);
        expect(await reportServerGame(pool, serverReport(m1, 1, a, [a, 15, b, 9]))).toMatchObject({ ok: true, status: 'ignored', reason: 'game-closed' });
        expect((await getMatch(pool, m1))!.games).toEqual([]);
    });

    it('refuses players who are not the two of the match, and ignores a match that is not called or started', async () => {
        const s = await setup();
        const [m1, m2] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        await callMatch(pool, m1);
        expect(await reportServerGame(pool, serverReport(m1, 1, a, [a, 15, s.players[1], 9]))).toEqual({ ok: false, error: 'players' });
        expect(await reportServerGame(pool, serverReport(m1, 1, s.players[1], [a, 9, b, 15]))).toEqual({ ok: false, error: 'players' });
        expect(await reportServerGame(pool, serverReport(m1, 3, a, [a, 15, b, 9]))).toMatchObject({ ok: true, status: 'ignored', reason: 'game-ahead' });
        expect(await reportServerGame(pool, serverReport(m2, 1, s.players[1], [s.players[1], 15, s.players[2], 9]))).toMatchObject({ ok: true, status: 'ignored', reason: 'state' });
        expect(await reportServerGame(pool, serverReport(999999, 1, a, [a, 15, b, 9]))).toEqual({ ok: false, error: 'not-found' });
        // A finished game where the winner has fewer points is refused.
        expect(await reportServerGame(pool, serverReport(m1, 1, a, [a, 5, b, 9]))).toEqual({ ok: false, error: 'score' });
        expect((await getMatch(pool, m1))!.games).toEqual([]);
    });

    it('starts a called match when the first report comes before the connect report', async () => {
        const s = await setup();
        const [m1] = s.ids;
        await callMatch(pool, m1);
        expect(await reportServerGame(pool, serverReport(m1, 1, null, [s.players[0], 3, s.players[3], 3]))).toMatchObject({
            ok: true,
            status: 'applied',
            events: [{ type: 'started', matchId: m1 }],
        });
        expect((await getMatch(pool, m1))!).toMatchObject({ state: 'started', awaitingDecision: true });
    });
});

describe('live score', () => {
    it('stores the score of the game being played and shows it until the game has a result', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        expect(await getLiveScore(pool, m1)).toEqual({ matchId: m1, state: 'upcoming', live: null });
        await callMatch(pool, m1);
        expect(await updateLiveScore(pool, { matchId: m1, game: 1, points: [{ playerId: b, points: 4 }, { playerId: a, points: 2 }] }, NOW)).toEqual({ status: 'stored' });
        expect(await getLiveScore(pool, m1)).toEqual({
            matchId: m1,
            state: 'called',
            live: {
                game: 1,
                points: [
                    { playerId: a, points: 2 },
                    { playerId: b, points: 4 },
                ],
                updatedAt: NOW.toISOString(),
            },
        });
        const later = new Date(NOW.getTime() + 5000);
        expect(await updateLiveScore(pool, { matchId: m1, game: 1, points: [{ playerId: a, points: 3 }, { playerId: b, points: 4 }] }, later)).toEqual({ status: 'stored' });
        expect((await getLiveScore(pool, m1))!.live).toMatchObject({ game: 1, points: [{ points: 3 }, { points: 4 }], updatedAt: later.toISOString() });

        // The live score never changes a result.
        expect((await getMatch(pool, m1))!).toMatchObject({ state: 'called', games: [], score1: 0, score2: 0 });

        // Once game 1 has a result, its live score is hidden and late updates for it are ignored.
        await reportServerGame(pool, serverReport(m1, 1, a, [a, 15, b, 13]));
        expect(await getLiveScore(pool, m1)).toEqual({ matchId: m1, state: 'started', live: null });
        expect(await updateLiveScore(pool, { matchId: m1, game: 1, points: [{ playerId: a, points: 15 }, { playerId: b, points: 13 }] }, later)).toEqual({ status: 'ignored', reason: 'game-closed' });
        expect(await updateLiveScore(pool, { matchId: m1, game: 2, points: [{ playerId: a, points: 1 }, { playerId: b, points: 0 }] }, later)).toEqual({ status: 'stored' });
        expect((await getLiveScore(pool, m1))!.live).toMatchObject({ game: 2 });
    });

    it('ignores a game number past the next game, so it cannot block the real game', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        await callMatch(pool, m1);
        expect(await updateLiveScore(pool, { matchId: m1, game: 5, points: [{ playerId: a, points: 1 }, { playerId: b, points: 0 }] }, NOW)).toEqual({ status: 'ignored', reason: 'game-ahead' });
        expect((await getLiveScore(pool, m1))!.live).toBeNull();
        expect(await updateLiveScore(pool, { matchId: m1, game: 1, points: [{ playerId: a, points: 9 }, { playerId: b, points: 0 }] }, NOW)).toEqual({ status: 'stored' });
        expect((await getLiveScore(pool, m1))!.live).toMatchObject({ game: 1, points: [{ points: 9 }, { points: 0 }] });
    });

    it('ignores an unknown match, a match that is not called or started, and other players', async () => {
        const s = await setup();
        const [m1, m2] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        const points = [
            { playerId: a, points: 1 },
            { playerId: b, points: 0 },
        ];
        expect(await updateLiveScore(pool, { matchId: 999999, game: 1, points }, NOW)).toEqual({ status: 'ignored', reason: 'not-found' });
        expect(await updateLiveScore(pool, { matchId: m1, game: 1, points }, NOW)).toEqual({ status: 'ignored', reason: 'state' });
        await callMatch(pool, m1);
        expect(await updateLiveScore(pool, { matchId: m1, game: 1, points: [points[0], { playerId: s.players[1], points: 0 }] }, NOW)).toEqual({ status: 'ignored', reason: 'players' });
        expect(await updateLiveScore(pool, { matchId: m2, game: 1, points }, NOW)).toEqual({ status: 'ignored', reason: 'state' });
        expect(await getLiveScore(pool, 999999)).toBeNull();
        expect((await pool.query('SELECT count(*)::int AS n FROM live_scores')).rows[0].n).toBe(0);
    });

    it('is hidden after a reset, so the old game does not show', async () => {
        const s = await setup();
        const [m1] = s.ids;
        const [a, b] = [s.players[0], s.players[3]];
        await callMatch(pool, m1);
        await reportPlayersConnected(pool, m1);
        await updateLiveScore(pool, { matchId: m1, game: 1, points: [{ playerId: a, points: 7 }, { playerId: b, points: 2 }] }, NOW);
        await resetMatch(pool, m1);
        await callMatch(pool, m1);
        expect(await getLiveScore(pool, m1)).toEqual({ matchId: m1, state: 'called', live: null });
    });
});

describe('a 1v1 match in the sync', () => {
    it('shows up once accepted and called', async () => {
        const s = await setup();
        const made = await createChallenge(pool, s.players[1], s.players[2], { bestOf: 1, ruleFile: 'fun.lua', scoreToWin: 7, speed: 120 });
        if (!made.ok) throw new Error(made.error);
        expect(await acceptChallenge(pool, made.matchId, s.players[2])).toMatchObject({ ok: true });
        expect(await callMatch(pool, made.matchId)).toMatchObject({ ok: true });
        expect((await getServerSync(pool, NOW)).matches).toEqual([
            expect.objectContaining({ matchId: made.matchId, state: 'called', bestOf: 1, ruleFile: 'fun.lua', scoreToWin: 7, speed: 120, players: [expect.objectContaining({ playerId: s.players[1] }), expect.objectContaining({ playerId: s.players[2] })] }),
        ]);
    });
});
