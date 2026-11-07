import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../scripts/migrate.mjs';
import { generateBracket, type BestOf } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { newJoinCode } from '@/lib/players/join-code';
import { replayElo, type RatedMatch } from '@/lib/stats/elo';
import { placeBet } from './bets';
import { createEvent, setActiveEvent } from './events';
import { addLedger } from './foza';
import { acceptChallenge, callMatch, cancelMatch, createChallenge, enterGameResult, getMatch, listMatches, recordNoShow, reportPlayersConnected, resetMatch, setSeriesScore } from './matches';
import { eloForEvent, eloRatings, getLeaderboard, getPlayerStats } from './stats';
import { saveTournament } from './tournaments';
import { inTransaction } from './transaction';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan = (n: number): EventInput => ({ name: `LAN ${n}`, startsOn: `202${n}-11-20`, endsOn: `202${n}-11-22`, code: `LAN-202${n}`, startingFoza: 1000, dailyFoza: 0 });
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

async function event(n: number, names: string[]) {
    const eventId = await createEvent(pool, lan(n));
    await setActiveEvent(pool, eventId);
    const ids: Record<string, number> = {};
    for (const name of names) ids[name] = await addPlayer(eventId, name);
    return { eventId, ids };
}

/** An accepted 1v1 match, which accepting calls. */
async function oneVsOne(a: number, b: number, bestOf: BestOf = 1): Promise<number> {
    const created = await createChallenge(pool, a, b, { bestOf });
    if (!created.ok) throw new Error(created.error);
    expect(await acceptChallenge(pool, created.matchId, b)).toMatchObject({ ok: true, called: true });
    return created.matchId;
}

async function start(matchId: number) {
    // An accepted 1v1 match is called when it is accepted, so only a tournament match is called here.
    if ((await getMatch(pool, matchId))!.state === 'upcoming') expect(await callMatch(pool, matchId)).toMatchObject({ ok: true });
    expect(await reportPlayersConnected(pool, matchId)).toMatchObject({ ok: true, started: true });
}

/** Enters the next game of a match with the given points. The slot with more points wins. */
async function game(matchId: number, points1: number, points2: number, number?: number) {
    const match = (await getMatch(pool, matchId))!;
    const result = await enterGameResult(pool, matchId, { game: number ?? match.nextGame, winnerSlot: points1 > points2 ? 1 : 2, points1, points2 });
    expect(result).toMatchObject({ ok: true });
}

/** Plays a best of 1 match between two players. The first one wins 15-7. */
async function win(winner: number, loser: number): Promise<number> {
    const id = await oneVsOne(winner, loser);
    await start(id);
    await game(id, 15, 7);
    return id;
}

const rated = (winner: string, loser: string): RatedMatch => ({ matchId: 0, eventId: 0, tournamentId: null, winner, loser });

describe('Elo', () => {
    it('rates only played matches, recalculates corrections in play order and carries ratings into the next event', async () => {
        const one = await event(1, ['A', 'B', 'C']);
        const { A, B, C } = one.ids;
        const m1 = await win(A, B);
        await win(B, C);
        await win(C, A);

        // A no-show and a cancelled match change nothing.
        const noShow = await oneVsOne(A, C);
        await recordNoShow(pool, noShow, 2);
        const cancelled = await oneVsOne(B, C);
        await start(cancelled);
        await game(cancelled, 15, 3);
        await resetMatch(pool, cancelled);
        await cancelMatch(pool, cancelled);

        let expected = replayElo([rated('a', 'b'), rated('b', 'c'), rated('c', 'a')]).ratings;
        let elo = await eloForEvent(pool, one.eventId);
        expect(elo.get(A)!.rating).toBeCloseTo(expected.get('a')!, 9);
        expect(elo.get(B)!.rating).toBeCloseTo(expected.get('b')!, 9);
        expect(elo.get(C)!.matches).toBe(2);

        // The first match is corrected after the others were played. It stays first.
        await game(m1, 7, 15, 1);
        expected = replayElo([rated('b', 'a'), rated('b', 'c'), rated('c', 'a')]).ratings;
        elo = await eloForEvent(pool, one.eventId);
        for (const [key, id] of [['a', A], ['b', B], ['c', C]] as const) {
            expect(elo.get(id)).toMatchObject({ start: 1000, matches: 2 });
            expect(elo.get(id)!.rating).toBeCloseTo(expected.get(key)!, 9);
            expect(elo.get(id)!.change).toBeCloseTo(expected.get(key)! - 1000, 9);
        }

        // The next event knows a player by the nickname, ignoring case.
        const two = await event(2, ['a', 'D']);
        const m6 = await win(two.ids.a, two.ids.D);
        const end1 = expected.get('a')!;
        let next = await eloForEvent(pool, two.eventId);
        expect(next.get(two.ids.a)!.start).toBeCloseTo(end1, 9);
        expect(next.get(two.ids.D)!.start).toBe(1000);
        const after = replayElo([rated('b', 'a'), rated('b', 'c'), rated('c', 'a'), rated('a', 'd')]).ratings;
        expect(next.get(two.ids.a)!.rating).toBeCloseTo(after.get('a')!, 9);
        expect(next.get(two.ids.a)!.change).toBeCloseTo(after.get('a')! - end1, 9);

        // The first event keeps its own numbers.
        expect((await eloForEvent(pool, one.eventId)).get(A)!.rating).toBeCloseTo(end1, 9);

        // A correction in a past event moves the ratings of every later event.
        await game(m1, 15, 7, 1);
        next = await eloForEvent(pool, two.eventId);
        const corrected = replayElo([rated('a', 'b'), rated('b', 'c'), rated('c', 'a'), rated('a', 'd')]).ratings;
        expect(next.get(two.ids.a)!.rating).toBeCloseTo(corrected.get('a')!, 9);

        // A reset takes the match out until it is played again.
        await resetMatch(pool, m6);
        next = await eloForEvent(pool, two.eventId);
        expect(next.get(two.ids.D)).toMatchObject({ rating: 1000, change: 0, matches: 0 });
    });

    it('gives the current ratings for seeding a tournament by Elo', async () => {
        const { eventId, ids } = await event(1, ['A', 'B', 'C', 'D']);
        await win(ids.D, ids.A);
        await win(ids.D, ids.B);
        await win(ids.C, ids.A);
        const ratings = await eloRatings(pool, eventId);
        const bracket = generateBracket({ format: 'single_elimination', players: [ids.A, ids.B, ids.C, ids.D], seeding: { method: 'elo', ratings } });
        expect(bracket.seeds).toEqual([ids.D, ids.C, ids.B, ids.A]);
    });
});

describe('leaderboards', () => {
    it('counts matches, games and points, and updates them after a correction', async () => {
        const { eventId, ids } = await event(1, ['A', 'B', 'C']);
        const { A, B, C } = ids;
        const m1 = await oneVsOne(A, B, 3);
        await start(m1);
        await game(m1, 15, 10);
        await game(m1, 12, 15);
        await game(m1, 15, 13);
        await win(A, C);
        await win(C, B);

        let board = (await getLeaderboard(pool, eventId))!;
        expect(board.wins.map((s) => s.playerId)).toEqual([A, C, B]);
        expect(board.wins[0]).toMatchObject({ matchesWon: 2, matchesLost: 0, gamesWon: 3, gamesLost: 1, pointsScored: 57, pointsConceded: 45, longestStreak: 2, winRate: 1 });
        expect(board.wins[0].headToHead).toEqual([
            { opponentId: B, won: 1, lost: 0 },
            { opponentId: C, won: 1, lost: 0 },
        ]);

        // B wins the third game after all, and the series.
        await game(m1, 13, 15, 3);
        board = (await getLeaderboard(pool, eventId))!;
        const a = board.wins.find((s) => s.playerId === A)!;
        expect(a).toMatchObject({ matchesWon: 1, matchesLost: 1, gamesWon: 2, gamesLost: 2, pointsScored: 55, pointsConceded: 47, longestStreak: 1 });

        // A series score set by hand replaces the games before it, and their points no longer count.
        await setSeriesScore(pool, m1, 0, 2);
        board = (await getLeaderboard(pool, eventId))!;
        expect(board.wins.find((s) => s.playerId === A)).toMatchObject({ gamesWon: 1, gamesLost: 2, pointsScored: 15, pointsConceded: 7 });
    });

    it('ranks bettors by correct bets and follows a correction that changes the winner', async () => {
        const { eventId, ids } = await event(1, ['A', 'B', 'X', 'Y', 'Z']);
        const { A, B, X, Y, Z } = ids;
        const id = await oneVsOne(A, B);
        expect(await placeBet(pool, X, { matchId: id, onPlayerId: A, amount: 100 }, NOW)).toMatchObject({ ok: true });
        expect(await placeBet(pool, Y, { matchId: id, onPlayerId: B, amount: 300 }, NOW)).toMatchObject({ ok: true });
        await start(id);
        await game(id, 15, 9);
        // Z is the only bettor on the next match and backs the loser.
        const other = await oneVsOne(B, A);
        expect(await placeBet(pool, Z, { matchId: other, onPlayerId: A, amount: 10 }, NOW)).toMatchObject({ ok: true });
        await start(other);
        await game(other, 15, 9);

        let board = (await getLeaderboard(pool, eventId))!;
        // Y and Z have no correct bets. Z lost nothing, so Z comes first of them.
        expect(board.bettors.map((b) => b.playerId)).toEqual([X, Z, Y]);
        expect(board.bettors[0]).toMatchObject({ bets: 1, correct: 1, hitRate: 1, fozaWon: 300, fozaLost: 0, net: 300, biggestWin: { matchId: id, onPlayerId: A, value: 300 }, bestOdds: { value: 4 } });
        // Nobody backed B in the second match, so Z got the stake back. That is still a wrong bet.
        expect(board.bettors[1]).toMatchObject({ bets: 1, correct: 0, fozaLost: 0, net: 0 });

        await game(id, 9, 15, 1);
        board = (await getLeaderboard(pool, eventId))!;
        expect(board.bettors.map((b) => b.playerId)).toEqual([Y, Z, X]);
        expect(board.bettors[0]).toMatchObject({ correct: 1, fozaWon: 100, bestOdds: { value: 400 / 300 } });
        expect(board.bettors[2]).toMatchObject({ correct: 0, fozaLost: 100, net: -100, biggestWin: null });

        // A no-show refunds the bets, so they drop out.
        await resetMatch(pool, id);
        await recordNoShow(pool, id, 2);
        board = (await getLeaderboard(pool, eventId))!;
        expect(board.bettors.map((b) => b.playerId)).toEqual([Z]);
    });

    it('limits a tournament board to its matches and lists its places', async () => {
        const { eventId, ids } = await event(1, ['A', 'B', 'C', 'D', 'E']);
        const players = [ids.A, ids.B, ids.C, ids.D];
        const bracket = generateBracket({ format: 'single_elimination', players, seeding: { method: 'manual', order: players } });
        const saved = await saveTournament(pool, eventId, { name: 'Cup', seeding: 'manual', randomSeed: null, bracket });
        if (!saved.ok) throw new Error(saved.error);
        const matches = (await listMatches(pool, eventId)).filter((m) => m.tournamentId === saved.id);
        for (const m of matches) {
            await start(m.id);
            await game(m.id, 15, 4);
        }
        await win(ids.E, ids.A);

        const cup = (await getLeaderboard(pool, eventId, saved.id))!;
        const placed = cup.placings.map((p) => [p.place, p.playerId]);
        expect(placed).toEqual([
            [1, ids.A],
            [2, ids.B],
            [3, ids.C],
            [3, ids.D],
        ]);
        expect(cup.wins.map((s) => s.playerId)).toEqual([ids.A, ids.B, ids.C, ids.D]);
        expect(cup.elo.map((e) => e.playerId)).not.toContain(ids.E);
        const all = (await getLeaderboard(pool, eventId))!;
        expect(all.wins.map((s) => s.playerId)).toContain(ids.E);
        expect(all.elo.map((e) => e.playerId)).toContain(ids.E);
        expect(await getLeaderboard(pool, eventId, saved.id + 1)).toBeNull();

        const page = (await getPlayerStats(pool, ids.A))!;
        expect(page.player).toMatchObject({ nickname: 'A', eventId });
        expect(page.stats).toMatchObject({ matchesWon: 2, matchesLost: 1 });
        expect(page.placings).toEqual([{ tournamentId: saved.id, tournamentName: 'Cup', playerId: ids.A, place: 1 }]);
        expect(page.betting).toBeNull();
        expect(await getPlayerStats(pool, 999_999)).toBeNull();
    });
});
