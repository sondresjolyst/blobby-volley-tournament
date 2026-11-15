import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import type { EventInput } from '@/lib/events/input';
import type { GameStats, PlayerGameStats } from '@/lib/game-server/stats';
import { newJoinCode } from '@/lib/players/join-code';
import type { TrainingOptions } from '@/lib/training/settings';
import { withAccount } from './db-test-sql';
import { createEvent, setActiveEvent } from './events';
import { getMatchStats, getPlayerStatTotals } from './game-stats';
import { acceptChallenge, createChallenge, enterGameResult, reportServerGame, type ServerGameReport } from './matches';
import { createTraining, reportTrainingConnected, reportTrainingGame } from './training';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const LAN: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 0 };
const OPTIONS: TrainingOptions = { bot: 'hyp014', difficulty: 13, ruleFile: 'default.lua', scoreToWin: 15 };

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
});

afterAll(async () => {
    await pool.end();
});

let uuids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuids).padStart(12, '0')}`;

async function addPlayer(eventId: number, nickname: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
        `${withAccount()} INSERT INTO players (account_id, event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance, join_code)
         VALUES ((SELECT id FROM account), $1, $2, $3, '\\x00', '\\x00', 0, $4) RETURNING id`,
        [eventId, nickname, nickname.toLowerCase(), newJoinCode()],
    );
    return rows[0].id;
}

const line = (playerId: number, ballSteps: number, touches: number, errors: number, netHits: number): PlayerGameStats => ({ playerId, ballSteps, touches, errors, netHits });
const gameStats = (a: PlayerGameStats, b: PlayerGameStats, rallies: number, longestRally: number, rallyTouches: number): GameStats => ({ players: [a, b], rallies, longestRally, rallyTouches });

async function setup() {
    const eventId = await createEvent(pool, LAN);
    await setActiveEvent(pool, eventId);
    const ola = await addPlayer(eventId, 'Ola');
    const kari = await addPlayer(eventId, 'Kari');
    const pia = await addPlayer(eventId, 'Pia');
    return { eventId, ola, kari, pia };
}

/** A called 1v1 match to three games, with the first player as challenger. */
async function match(a: number, b: number): Promise<number> {
    const challenge = await createChallenge(pool, a, b, { bestOf: 3 });
    if (!challenge.ok) throw new Error(challenge.error);
    const accepted = await acceptChallenge(pool, challenge.matchId, b);
    if (!accepted.ok) throw new Error(accepted.error);
    return challenge.matchId;
}

async function report(matchId: number, game: number, winner: number | null, a: number, pointsA: number, b: number, pointsB: number, stats: GameStats | null): Promise<void> {
    const r: ServerGameReport = {
        reportId: uuid(),
        matchId,
        game,
        winnerId: winner,
        points: [
            { playerId: a, points: pointsA },
            { playerId: b, points: pointsB },
        ],
        stats,
        startedAt: new Date('2026-11-20T18:00:00Z'),
        endedAt: new Date('2026-11-20T18:05:00Z'),
    };
    expect(await reportServerGame(pool, r)).toMatchObject({ ok: true, status: 'applied' });
}

async function train(playerId: number, stats: GameStats | null): Promise<number> {
    const created = await createTraining(pool, playerId, OPTIONS);
    if (!created.ok) throw new Error(created.error);
    await reportTrainingConnected(pool, created.id, [playerId, 0]);
    const result = await reportTrainingGame(pool, {
        reportId: uuid(),
        matchId: created.id,
        game: 1,
        status: 'finished',
        winnerId: playerId,
        points: [
            { playerId, points: 15 },
            { playerId: 0, points: 4 },
        ],
        stats,
        startedAt: new Date('2026-11-20T18:00:00Z'),
        endedAt: new Date('2026-11-20T18:03:00Z'),
    });
    expect(result).toEqual({ status: 'stored' });
    return created.id;
}

/** Ola wins two games against Kari, and trains once. */
async function play() {
    const s = await setup();
    const id = await match(s.ola, s.kari);
    await report(id, 1, s.ola, s.ola, 15, s.kari, 8, gameStats(line(s.ola, 4000, 30, 2, 1), line(s.kari, 6000, 20, 4, 0), 10, 8, 50));
    await report(id, 2, s.ola, s.ola, 15, s.kari, 12, gameStats(line(s.ola, 2000, 10, 0, 2), line(s.kari, 2000, 10, 2, 0), 5, 12, 20));
    const trainingId = await train(s.ola, gameStats(line(s.ola, 1000, 8, 6, 4), line(0, 3000, 6, 1, 0), 4, 5, 10));
    return { ...s, id, trainingId };
}

describe('player stat totals', () => {
    it('adds the raw numbers in each scope', async () => {
        const s = await play();
        const totals = await getPlayerStatTotals(pool, s.ola);
        expect(totals.matches).toEqual({ games: 2, possession: 6000 / 14000, touchesPerGame: 20, errorsPerGame: 1, netHits: 3, longestRally: 12, averageRally: 70 / 15 });
        expect(totals.training).toEqual({ games: 1, possession: 0.25, touchesPerGame: 8, errorsPerGame: 6, netHits: 4, longestRally: 5, averageRally: 2.5 });
        expect(totals.all).toEqual({ games: 3, possession: 7000 / 18000, touchesPerGame: 16, errorsPerGame: 8 / 3, netHits: 7, longestRally: 12, averageRally: 80 / 19 });
    });

    it('gives the other player the other side of the same games', async () => {
        const s = await play();
        const totals = await getPlayerStatTotals(pool, s.kari);
        expect(totals.matches).toMatchObject({ games: 2, possession: 8000 / 14000, touchesPerGame: 15, errorsPerGame: 3, netHits: 0 });
        expect(totals.training).toEqual({ games: 0, possession: null, touchesPerGame: null, errorsPerGame: null, netHits: 0, longestRally: null, averageRally: null });
    });

    it('admin_override_drops_old_stats', async () => {
        const s = await play();
        const { rows } = await pool.query<{ player1_id: number }>('SELECT player1_id FROM matches WHERE id = $1', [s.id]);
        const slot = rows[0].player1_id === s.ola ? 1 : 2;
        expect(await enterGameResult(pool, s.id, { game: 2, winnerSlot: slot, points1: 15, points2: 0 })).toMatchObject({ ok: true });
        const totals = await getPlayerStatTotals(pool, s.ola);
        expect(totals.matches).toMatchObject({ games: 1, possession: 0.4, touchesPerGame: 30, longestRally: 8 });
        const page = await getMatchStats(pool, s.id);
        expect(page?.games.map((g) => [g.game, g.stats !== null])).toEqual([
            [1, true],
            [2, false],
        ]);
    });

    it('ignores the stats of an abandoned game', async () => {
        const s = await setup();
        const id = await match(s.ola, s.pia);
        await report(id, 1, null, s.ola, 4, s.pia, 6, gameStats(line(s.ola, 100, 5, 1, 0), line(s.pia, 200, 6, 1, 0), 2, 3, 6));
        expect((await getPlayerStatTotals(pool, s.ola)).matches.games).toBe(0);
        expect((await getMatchStats(pool, id))?.games).toEqual([]);
    });

    it('leaves out training that is not finished', async () => {
        const s = await setup();
        const created = await createTraining(pool, s.ola, OPTIONS);
        if (!created.ok) throw new Error(created.error);
        await pool.query(`UPDATE training_matches SET stats = $2 WHERE id = $1`, [created.id, JSON.stringify(gameStats(line(s.ola, 1, 1, 1, 1), line(0, 1, 1, 1, 1), 1, 1, 1))]);
        expect((await getPlayerStatTotals(pool, s.ola)).training.games).toBe(0);
        expect((await getMatchStats(pool, created.id))?.games).toEqual([]);
    });
});

describe('match stats', () => {
    it('shows the games and the totals of a match in the order of the players', async () => {
        const s = await play();
        const [first, second] = (await pool.query<{ player1_id: number; player2_id: number }>('SELECT player1_id, player2_id FROM matches WHERE id = $1', [s.id])).rows.map((r) => [r.player1_id, r.player2_id])[0];
        const page = await getMatchStats(pool, s.id);
        expect(page).toMatchObject({ kind: 'match', eventId: s.eventId, names: [first === s.ola ? 'Ola' : 'Kari', second === s.ola ? 'Ola' : 'Kari'] });
        expect(page?.games).toHaveLength(2);
        expect(page?.games[0].stats?.players.map((p) => p.playerId)).toEqual([first, second]);
        expect(page?.games[0].stats).toMatchObject({ rallies: 10, longestRally: 8, rallyTouches: 50 });
        const ola = first === s.ola ? 0 : 1;
        expect(page?.games[0].points[ola]).toBe(15);
        expect(page?.totals).toMatchObject({ games: 2, rallies: 15, longestRally: 12, averageRally: 70 / 15 });
        expect(page?.totals.players[ola]).toEqual({ possession: 6000 / 14000, touches: 40, errors: 2, netHits: 3 });
    });

    it('match_without_stats_returns_null_stats', async () => {
        const s = await setup();
        const id = await match(s.ola, s.kari);
        await report(id, 1, s.ola, s.ola, 15, s.kari, 8, null);
        const page = await getMatchStats(pool, id);
        expect(page?.games).toHaveLength(1);
        expect(page?.games[0].stats).toBeNull();
        expect(page?.totals).toMatchObject({ games: 0, rallies: 0, longestRally: null, averageRally: null });
        expect(page?.totals.players[0].possession).toBeNull();
    });

    it('shows a training match with the bot and the player first', async () => {
        const s = await play();
        const page = await getMatchStats(pool, s.trainingId);
        expect(page).toMatchObject({ kind: 'training', state: 'finished', names: ['Ola', 'Bot (hyp014, vanskegrad 13)'] });
        expect(page?.games).toEqual([{ game: 1, points: [15, 4], stats: gameStats(line(s.ola, 1000, 8, 6, 4), line(0, 3000, 6, 1, 0), 4, 5, 10) }]);
        expect(page?.totals.players[0]).toEqual({ possession: 0.25, touches: 8, errors: 6, netHits: 4 });
    });

    it('gives the player ids and the settings of a match', async () => {
        const s = await play();
        const row = (await pool.query<{ player1_id: number; player2_id: number; score_to_win: number; game_speed: number }>('SELECT player1_id, player2_id, score_to_win, game_speed FROM matches WHERE id = $1', [s.id])).rows[0];
        const page = await getMatchStats(pool, s.id);
        expect(page).toMatchObject({ playerIds: [row.player1_id, row.player2_id], ruleFile: 'default.lua', scoreToWin: row.score_to_win, speed: row.game_speed, bestOf: 3, bot: null });
        expect(typeof page?.speed).toBe('number');
    });

    it('gives the player id and the settings of a training match', async () => {
        const s = await play();
        const page = await getMatchStats(pool, s.trainingId);
        expect(page).toMatchObject({ playerIds: [s.ola, 0], ruleFile: 'default.lua', scoreToWin: 15, bestOf: null, bot: { name: 'hyp014', difficulty: 13 } });
        expect(typeof page?.speed).toBe('number');
    });

    it('gives null for an id that is neither', async () => {
        await setup();
        expect(await getMatchStats(pool, 99999)).toBeNull();
    });
});
