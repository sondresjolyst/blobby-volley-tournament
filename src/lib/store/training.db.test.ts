import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import type { TrainingOptions } from '@/lib/training/settings';
import { listMatchPools } from './bets';
import { createEvent, setActiveEvent } from './events';
import { getServerSync } from './game-server';
import { liveStamp } from './live';
import { acceptChallenge, createChallenge, listMatches } from './matches';
import { getLeaderboard } from './stats';
import { withAccount } from './db-test-sql';
import {
    cancelTraining,
    createTraining,
    getOpenTraining,
    getPlayerTrainingStats,
    getTrainingOverview,
    listLiveTraining,
    reportTrainingConnected,
    reportTrainingGame,
    type TrainingReport,
} from './training';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan = (n: number): EventInput => ({ name: `LAN ${n}`, startsOn: `202${n}-11-20`, endsOn: `202${n}-11-22`, code: `LAN-202${n}`, startingFoza: 1000, dailyFoza: 0 });
const NOW = new Date('2026-11-20T12:00:00Z');
const OPTIONS: TrainingOptions = { bot: 'hyp014', difficulty: 13, ruleFile: 'default.lua', scoreToWin: 15 };

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

async function addPlayer(eventId: number, nickname: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
        `${withAccount()} INSERT INTO players (account_id, event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, created_at, join_code)
         VALUES ((SELECT id FROM account), $1, $2, $3, '\\x00', '\\x00', 0, $4, $5) RETURNING id`,
        [eventId, nickname, nickname.toLowerCase(), NOW, newJoinCode()],
    );
    return rows[0].id;
}

async function event(n: number, names: string[]) {
    const eventId = await createEvent(pool, lan(n));
    await setActiveEvent(pool, eventId);
    const ids: Record<string, number> = {};
    for (const name of names) ids[name] = await addPlayer(eventId, name);
    return { eventId, ids };
}

let reports = 0;
const reportId = () => `00000000-0000-4000-8000-${String(++reports).padStart(12, '0')}`;

const report = (matchId: number, playerId: number, playerPoints: number, botPoints: number, change: Partial<TrainingReport> = {}): TrainingReport => ({
    reportId: reportId(),
    matchId,
    game: 1,
    status: 'finished',
    winnerId: playerPoints > botPoints ? playerId : 0,
    points: [
        { playerId, points: playerPoints },
        { playerId: 0, points: botPoints },
    ],
    startedAt: new Date('2026-11-20T18:00:00Z'),
    endedAt: new Date('2026-11-20T18:03:00Z'),
    ...change,
});

/** Starts a training, connects the player and reports one game. */
async function train(playerId: number, options: Partial<TrainingOptions>, playerPoints: number, botPoints: number): Promise<number> {
    const created = await createTraining(pool, playerId, { ...OPTIONS, ...options });
    if (!created.ok) throw new Error(created.error);
    expect(await reportTrainingConnected(pool, created.id, [playerId, 0])).toEqual({ ok: true, started: true });
    expect(await reportTrainingGame(pool, report(created.id, playerId, playerPoints, botPoints))).toEqual({ status: 'stored' });
    return created.id;
}

describe('training matches', () => {
    it('starts a training match that the game server gets in its sync', async () => {
        const { eventId, ids } = await event(1, ['Ola', 'Kari']);
        const challenge = await createChallenge(pool, ids.Ola, ids.Kari);
        expect(challenge.ok).toBe(true);
        const created = await createTraining(pool, ids.Kari, OPTIONS);
        expect(created.ok).toBe(true);
        if (!created.ok || !challenge.ok) return;
        // training ids come from the ids of the matches, so the game server never sees one twice
        expect(created.id).toBeGreaterThan(challenge.matchId);

        const sync = await getServerSync(pool, NOW);
        const entry = sync.matches.find((m) => m.matchId === created.id);
        expect(entry).toMatchObject({ state: 'called', bestOf: 1, nextGame: 1, ruleFile: 'default.lua', scoreToWin: 15, players: [{ playerId: ids.Kari }], training: { bot: 'hyp014', difficulty: 13 } });
        expect(entry?.players).toHaveLength(1);
        expect(await listLiveTraining(pool, eventId)).toMatchObject([{ id: created.id, nickname: 'Kari', bot: 'hyp014', difficulty: 13, state: 'called' }]);
    });

    it('moves the live version, so the open pages load again', async () => {
        const { eventId, ids } = await event(1, ['Ola']);
        const before = await liveStamp(pool, eventId);
        await createTraining(pool, ids.Ola, OPTIONS);
        expect(await liveStamp(pool, eventId)).not.toBe(before);
    });

    it('allows one open training match per player', async () => {
        const { ids } = await event(1, ['Ola']);
        expect((await createTraining(pool, ids.Ola, OPTIONS)).ok).toBe(true);
        expect(await createTraining(pool, ids.Ola, OPTIONS)).toEqual({ ok: false, error: 'taken' });
    });

    it('refuses bad settings and a player of an event that is not active', async () => {
        const { ids } = await event(1, ['Ola']);
        expect(await createTraining(pool, ids.Ola, { ...OPTIONS, bot: 'nosuchbot' as TrainingOptions['bot'] })).toEqual({ ok: false, error: 'settings' });
        expect(await createTraining(pool, ids.Ola, { ...OPTIONS, difficulty: 26 })).toEqual({ ok: false, error: 'settings' });
        await event(2, []);
        expect(await createTraining(pool, ids.Ola, OPTIONS)).toEqual({ ok: false, error: 'no-event' });
    });

    it('refuses a player who is in a called match, and a called match ends the training', async () => {
        const { ids } = await event(1, ['Ola', 'Kari', 'Per']);
        const training = await createTraining(pool, ids.Ola, OPTIONS);
        expect(training.ok).toBe(true);
        // a real match comes first: the training of a called player ends
        const challenge = await createChallenge(pool, ids.Kari, ids.Ola);
        if (!challenge.ok) throw new Error(challenge.error);
        expect(await acceptChallenge(pool, challenge.matchId, ids.Ola)).toMatchObject({ ok: true, called: true });
        expect(await getOpenTraining(pool, ids.Ola)).toBeNull();
        const { rows } = await pool.query('SELECT state, cancel_reason FROM training_matches');
        expect(rows).toEqual([{ state: 'cancelled', cancel_reason: 'replaced' }]);
        // one live match at a time
        expect(await createTraining(pool, ids.Ola, OPTIONS)).toEqual({ ok: false, error: 'player-busy' });
        expect((await createTraining(pool, ids.Per, OPTIONS)).ok).toBe(true);
    });

    it('lets the player stop their own training only', async () => {
        const { ids } = await event(1, ['Ola', 'Kari']);
        const created = await createTraining(pool, ids.Ola, OPTIONS);
        if (!created.ok) throw new Error(created.error);
        expect(await cancelTraining(pool, ids.Kari, created.id)).toEqual({ ok: false, error: 'not-found' });
        expect(await cancelTraining(pool, ids.Ola, created.id)).toEqual({ ok: true });
        expect(await cancelTraining(pool, ids.Ola, created.id)).toEqual({ ok: false, error: 'not-found' });
        expect((await getServerSync(pool, NOW)).matches).toEqual([]);
    });

    it('starts when the player joins and checks the players', async () => {
        const { ids } = await event(1, ['Ola', 'Kari']);
        const created = await createTraining(pool, ids.Ola, OPTIONS);
        if (!created.ok) throw new Error(created.error);
        expect(await reportTrainingConnected(pool, created.id, [ids.Kari, 0])).toEqual({ ok: false, error: 'players' });
        expect(await reportTrainingConnected(pool, created.id, [ids.Ola, 0])).toEqual({ ok: true, started: true });
        expect(await reportTrainingConnected(pool, created.id, [0, ids.Ola])).toEqual({ ok: true, started: false });
        expect(await reportTrainingConnected(pool, 999999, [ids.Ola, 0])).toEqual({ ok: false, error: 'not-found' });
    });

    it('stores a finished game once and ends the match', async () => {
        const { ids } = await event(1, ['Ola']);
        const created = await createTraining(pool, ids.Ola, OPTIONS);
        if (!created.ok) throw new Error(created.error);
        const game = report(created.id, ids.Ola, 15, 9);
        expect(await reportTrainingGame(pool, game)).toEqual({ status: 'stored' });
        expect(await reportTrainingGame(pool, game)).toEqual({ status: 'duplicate' });
        expect(await reportTrainingGame(pool, report(created.id, ids.Ola, 3, 15))).toEqual({ status: 'game-closed' });
        const { rows } = await pool.query('SELECT state, won, player_points, bot_points FROM training_matches');
        expect(rows).toEqual([{ state: 'finished', won: true, player_points: 15, bot_points: 9 }]);
        expect(await getOpenTraining(pool, ids.Ola)).toBeNull();
        expect((await getServerSync(pool, NOW)).matches).toEqual([]);
    });

    it('refuses a game with the wrong players, a later game or a score below the points to win', async () => {
        const { ids } = await event(1, ['Ola', 'Kari']);
        const created = await createTraining(pool, ids.Ola, { ...OPTIONS, scoreToWin: 15 });
        if (!created.ok) throw new Error(created.error);
        expect(await reportTrainingGame(pool, report(created.id, ids.Kari, 15, 3))).toEqual({ status: 'refused', reason: 'players' });
        expect(await reportTrainingGame(pool, report(created.id, ids.Ola, 15, 3, { game: 2 }))).toEqual({ status: 'refused', reason: 'game-ahead' });
        expect(await reportTrainingGame(pool, report(created.id, ids.Ola, 10, 3))).toEqual({ status: 'refused', reason: 'score' });
        expect(await reportTrainingGame(pool, report(999999, ids.Ola, 15, 3))).toEqual({ status: 'refused', reason: 'not-found' });
    });

    it('ends without a result when the player leaves', async () => {
        const { ids } = await event(1, ['Ola']);
        const created = await createTraining(pool, ids.Ola, OPTIONS);
        if (!created.ok) throw new Error(created.error);
        expect(await reportTrainingGame(pool, report(created.id, ids.Ola, 3, 5, { status: 'abandoned', winnerId: null }))).toEqual({ status: 'stored' });
        const { rows } = await pool.query('SELECT state, cancel_reason, won FROM training_matches');
        expect(rows).toEqual([{ state: 'cancelled', cancel_reason: 'left', won: null }]);
        expect((await getPlayerTrainingStats(pool, ids.Ola)).games).toBe(0);
    });

    it('refuses a game of a training the player stopped', async () => {
        const { ids } = await event(1, ['Ola']);
        const created = await createTraining(pool, ids.Ola, OPTIONS);
        if (!created.ok) throw new Error(created.error);
        await cancelTraining(pool, ids.Ola, created.id);
        expect(await reportTrainingGame(pool, report(created.id, ids.Ola, 15, 3))).toEqual({ status: 'refused', reason: 'state' });
    });
});

describe('training stats', () => {
    it('counts the games, wins and losses per bot and difficulty and finds the hardest bot beaten', async () => {
        const { ids } = await event(1, ['Ola']);
        await train(ids.Ola, { bot: 'reduced', difficulty: 20 }, 15, 4);
        await train(ids.Ola, { bot: 'reduced', difficulty: 20 }, 2, 15);
        await train(ids.Ola, { bot: 'reduced', difficulty: 20 }, 15, 13);
        await train(ids.Ola, { bot: 'hyp014', difficulty: 5 }, 15, 10);
        await train(ids.Ola, { bot: 'Union', difficulty: 0 }, 1, 15);
        // an open training does not count
        await createTraining(pool, ids.Ola, OPTIONS);

        const stats = await getPlayerTrainingStats(pool, ids.Ola);
        expect(stats).toMatchObject({ games: 5, wins: 3, losses: 2, hardestBeaten: { bot: 'hyp014', difficulty: 5 } });
        expect(stats.records).toEqual([
            { bot: 'reduced', difficulty: 20, games: 3, wins: 2, losses: 1 },
            { bot: 'Union', difficulty: 0, games: 1, wins: 0, losses: 1 },
            { bot: 'hyp014', difficulty: 5, games: 1, wins: 1, losses: 0 },
        ]);
    });

    it('has no hardest bot before the first win', async () => {
        const { ids } = await event(1, ['Ola']);
        expect(await getPlayerTrainingStats(pool, ids.Ola)).toEqual({ games: 0, wins: 0, losses: 0, records: [], hardestBeaten: null });
        await train(ids.Ola, {}, 3, 15);
        expect((await getPlayerTrainingStats(pool, ids.Ola)).hardestBeaten).toBeNull();
    });

    it('shows who trains the most, the most played bots and the wins per bot and difficulty', async () => {
        const { eventId, ids } = await event(1, ['Ola', 'Kari', 'Per']);
        await train(ids.Kari, { bot: 'reduced', difficulty: 13 }, 15, 3);
        await train(ids.Kari, { bot: 'reduced', difficulty: 13 }, 3, 15);
        await train(ids.Kari, { bot: 'hyp014', difficulty: 2 }, 15, 13);
        await train(ids.Ola, { bot: 'reduced', difficulty: 25 }, 15, 0);
        await train(ids.Per, { bot: 'reduced', difficulty: 25 }, 9, 15);

        const overview = await getTrainingOverview(pool, eventId);
        expect(overview.trainers).toEqual([
            { playerId: ids.Kari, nickname: 'Kari', games: 3, wins: 2 },
            { playerId: ids.Ola, nickname: 'Ola', games: 1, wins: 1 },
            { playerId: ids.Per, nickname: 'Per', games: 1, wins: 0 },
        ]);
        expect(overview.bots).toEqual([
            { bot: 'reduced', games: 4, playerWins: 2 },
            { bot: 'hyp014', games: 1, playerWins: 1 },
        ]);
        expect(overview.records).toEqual([
            { bot: 'hyp014', difficulty: 2, games: 1, wins: 1, losses: 0 },
            { bot: 'reduced', difficulty: 13, games: 2, wins: 1, losses: 1 },
            { bot: 'reduced', difficulty: 25, games: 2, wins: 1, losses: 1 },
        ]);
    });

    it('keeps each event to itself', async () => {
        const first = await event(1, ['Ola']);
        await train(first.ids.Ola, {}, 15, 3);
        const second = await event(2, ['Ola']);
        expect((await getTrainingOverview(pool, second.eventId)).trainers).toEqual([]);
        expect((await getTrainingOverview(pool, first.eventId)).trainers).toHaveLength(1);
    });

    it('never reaches the matches, the pools or the real leaderboard', async () => {
        const { eventId, ids } = await event(1, ['Ola', 'Kari']);
        await train(ids.Ola, {}, 15, 3);
        await createTraining(pool, ids.Kari, OPTIONS);
        expect(await listMatches(pool, eventId)).toEqual([]);
        expect(await listMatchPools(pool, eventId)).toEqual([]);
        const board = await getLeaderboard(pool, eventId);
        expect(board?.wins).toEqual([]);
        expect(board?.bettors).toEqual([]);
        for (const entry of board?.elo ?? []) expect(entry).toMatchObject({ matches: 0, change: 0 });
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM foza_ledger');
        expect(rows[0].n).toBe(0);
    });
});
