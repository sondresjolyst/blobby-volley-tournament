import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, MIGRATIONS_DIR, readMigrations } from '../../../scripts/migrate.mjs';
import { generateBracket, type BestOf, type FormatId } from '@/lib/bracket';
import type { EventInput } from '@/lib/events/input';
import { createEvent, setActiveEvent } from './events';
import type { MatchEvent } from './match-events';
import {
    acceptChallenge,
    callMatch,
    callMatches,
    cancelMatch,
    createChallenge,
    declineChallenge,
    enterGameResult,
    getMatch,
    getPlacings,
    listMatches,
    recordNoShow,
    reportGameResult,
    reportPlayersConnected,
    resetMatch,
    restartCurrentGame,
    setSeriesScore,
    withMatchForBet,
} from './matches';
import { getTournament, saveTournament } from './tournaments';

const handled = vi.hoisted(() => ({ calls: [] as MatchEvent[][], fail: false }));

vi.mock('./match-events', () => ({
    handleMatchEvents: async (client: { query: (sql: string) => Promise<unknown> }, events: MatchEvent[]) => {
        // Proves the hook runs inside the open transaction of the change.
        await client.query('SELECT txid_current_if_assigned()');
        handled.calls.push([...events]);
        if (handled.fail) throw new Error('settlement failed');
    },
}));

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const lan: EventInput = { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 };

let reportCounter = 0;
const nextReportId = () => `r-${++reportCounter}`;

beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(pool);
    handled.calls = [];
    handled.fail = false;
});

afterAll(async () => {
    await pool.end();
});

async function addPlayers(eventId: number, count: number, prefix = 'P'): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 1; i <= count; i++) {
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO players (event_id, nickname, nickname_key, pin_hash, pin_salt, foza_balance)
             VALUES ($1, $2, $3, '\\x00', '\\x00', 0) RETURNING id`,
            [eventId, `${prefix}${i}`, `${prefix.toLowerCase()}${i}`],
        );
        ids.push(rows[0].id);
    }
    return ids;
}

async function activeEvent(players: number) {
    const eventId = await createEvent(pool, lan);
    await setActiveEvent(pool, eventId);
    return { eventId, players: await addPlayers(eventId, players) };
}

/** Saves a tournament seeded in player order and returns its matches in play order. */
async function tournament(format: FormatId, count: number, bestOf: BestOf = 1, thirdPlaceMatch = false) {
    const { eventId, players } = await activeEvent(count);
    const planned = generateBracket({ format, players, seeding: { method: 'manual', order: players }, thirdPlaceMatch });
    const rounds = Object.fromEntries(planned.rounds.map((r) => [r.key, { bestOf }]));
    const bracket = generateBracket({ format, players, seeding: { method: 'manual', order: players }, thirdPlaceMatch, rounds });
    const saved = await saveTournament(pool, eventId, { name: 'Cup', seeding: 'manual', randomSeed: null, bracket });
    if (!saved.ok) throw new Error(saved.error);
    const structure = (await getTournament(pool, saved.id))!;
    const matches = await listMatches(pool, eventId);
    const byBracket = new Map(matches.map((m) => [m.bracketMatchId, m.id]));
    return {
        eventId,
        players,
        tournamentId: saved.id,
        structure,
        /** The runtime match id of each bracket match, in play order. */
        ids: structure.matches.map((m) => byBracket.get(m.id)!),
        /** The runtime match that the winner or loser of a match moves to, and the slot. */
        next(matchId: number, result: 'winner' | 'loser') {
            const bracketId = matches.find((m) => m.id === matchId)!.bracketMatchId;
            const to = structure.matches.find((m) => m.id === bracketId)![result === 'winner' ? 'winnerTo' : 'loserTo'];
            return to ? { matchId: byBracket.get(to.matchId)!, slot: to.slot } : null;
        },
    };
}

const report = (matchId: number, game: number, winnerSlot: 1 | 2 | null, reportId = nextReportId()) =>
    reportGameResult(pool, { reportId, matchId, game, winnerSlot, points1: winnerSlot === 1 ? 15 : 7, points2: winnerSlot === 2 ? 15 : 7 });

async function start(matchId: number) {
    expect(await callMatch(pool, matchId)).toMatchObject({ ok: true });
    expect(await reportPlayersConnected(pool, matchId)).toMatchObject({ ok: true, started: true });
}

/** Calls, starts and plays a match until the given slot has won the series. */
async function win(matchId: number, slot: 1 | 2) {
    await start(matchId);
    for (let i = 0; i < 4; i++) {
        const match = (await getMatch(pool, matchId))!;
        if (match.state === 'finished') break;
        expect(await report(matchId, match.nextGame, slot)).toMatchObject({ ok: true, status: 'applied' });
    }
    const match = (await getMatch(pool, matchId))!;
    expect(match.state).toBe('finished');
    return match;
}

const playersOf = async (matchId: number) => (await getMatch(pool, matchId))!.players.map((p) => p?.id ?? null);

describe('series scoring', () => {
    it.each([
        [1, [1], [1, 0]],
        [3, [2, 1, 2], [1, 2]],
        [5, [1, 2, 1, 2, 1], [3, 2]],
    ] as const)('best of %i finishes after the deciding game and survives a fresh read', async (bestOf, wins, final) => {
        const t = await tournament('single_elimination', 2, bestOf);
        const [id] = t.ids;
        await start(id);
        for (const [i, slot] of wins.entries()) {
            const before = (await getMatch(pool, id))!;
            expect(before.state).toBe('started');
            expect(await report(id, i + 1, slot)).toMatchObject({ ok: true, status: 'applied' });
        }
        // A new pool reads the stored score, as after a restart of the site.
        const fresh = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        try {
            const match = (await getMatch(fresh, id))!;
            expect([match.score1, match.score2]).toEqual(final);
            expect(match).toMatchObject({ state: 'finished', result: 'played', winnerId: final[0] > final[1] ? t.players[0] : t.players[1] });
            expect(match.games).toHaveLength(wins.length);
        } finally {
            await fresh.end();
        }
    });

    it('keeps a series at 1-1 until the next game is played', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        await report(id, 1, 1);
        await report(id, 2, 2);
        // Players reconnect for the next game. The score stays.
        expect(await reportPlayersConnected(pool, id)).toMatchObject({ ok: true, started: false });
        expect(await getMatch(pool, id)).toMatchObject({ state: 'started', score1: 1, score2: 1, nextGame: 3 });
    });
});

describe('abandoned games and restart', () => {
    it('stores an abandoned game without changing the score and waits for the admin', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        await report(id, 1, 1);
        expect(await report(id, 2, null)).toMatchObject({ ok: true, status: 'applied' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 1, score2: 0, nextGame: 3, awaitingDecision: true });
        expect((await getMatch(pool, id))!.games[1]).toMatchObject({ number: 2, status: 'abandoned', winnerSlot: null, source: 'server' });

        // The admin restarts it from 0-0. The replay is game 3.
        expect(await restartCurrentGame(pool, id)).toMatchObject({ ok: true, nextGame: 3 });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 1, score2: 0, nextGame: 3, awaitingDecision: false });
        await report(id, 3, 1);
        expect(await getMatch(pool, id)).toMatchObject({ state: 'finished', score1: 2, score2: 0, winnerId: t.players[0] });
    });

    it('lets the admin award an abandoned game', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        await report(id, 1, 2);
        await report(id, 2, null);
        expect(await enterGameResult(pool, id, { game: 2, winnerSlot: 2, points1: 3, points2: 9 })).toMatchObject({ ok: true });
        expect(await getMatch(pool, id)).toMatchObject({ state: 'finished', score1: 0, score2: 2, winnerId: t.players[1], awaitingDecision: false });
        expect((await getMatch(pool, id))!.games[1]).toMatchObject({ status: 'finished', winnerSlot: 2, source: 'admin' });
    });

    it('restarts a game in progress, so a late report for it is ignored', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        expect(await restartCurrentGame(pool, id)).toMatchObject({ ok: true, nextGame: 2 });
        expect(await report(id, 1, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'game-closed' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 0, score2: 0, nextGame: 2 });
        expect(await report(id, 2, 1)).toMatchObject({ ok: true, status: 'applied' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 1, score2: 0 });
    });

    it('refuses a restart when the match is not started', async () => {
        const t = await tournament('single_elimination', 2, 3);
        expect(await restartCurrentGame(pool, t.ids[0])).toEqual({ ok: false, error: 'state' });
    });
});

describe('manual series score', () => {
    it('replaces the games so far and later games count on top of it', async () => {
        const t = await tournament('single_elimination', 2, 5);
        const [id] = t.ids;
        await start(id);
        await report(id, 1, 1);
        expect(await setSeriesScore(pool, id, 0, 2)).toMatchObject({ ok: true });
        expect(await getMatch(pool, id)).toMatchObject({ state: 'started', score1: 0, score2: 2, manualScore: { score1: 0, score2: 2, afterGame: 1 } });
        await report(id, 2, 2);
        expect(await getMatch(pool, id)).toMatchObject({ state: 'finished', score1: 0, score2: 3, winnerId: t.players[1] });
    });

    it('refuses a score above the wins needed and a match that is not called', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        expect(await setSeriesScore(pool, id, 1, 0)).toEqual({ ok: false, error: 'state' });
        await callMatch(pool, id);
        expect(await setSeriesScore(pool, id, 3, 0)).toEqual({ ok: false, error: 'score' });
        expect(await setSeriesScore(pool, id, 2, 2)).toEqual({ ok: false, error: 'score' });
    });

    it('starts a called match first, so bets close before a result', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await callMatch(pool, id);
        handled.calls = [];
        await setSeriesScore(pool, id, 2, 0);
        expect(handled.calls.flat().map((e) => e.type)).toEqual(['started', 'finished']);
    });
});

describe('corrections and the bracket', () => {
    it('advances the winner and recalculates the winner and the bracket after a correction', async () => {
        const t = await tournament('single_elimination', 4, 3);
        const [semi1, semi2, final] = t.ids;
        const to = t.next(semi1, 'winner')!;
        expect(to.matchId).toBe(final);
        const won = await win(semi1, 1);
        expect((await playersOf(final))[to.slot - 1]).toBe(won.players[0]!.id);

        // The admin corrects game 2: player 2 won it, and game 3 went to player 2 too.
        await enterGameResult(pool, semi1, { game: 2, winnerSlot: 2, points1: 10, points2: 15 });
        expect(await getMatch(pool, semi1)).toMatchObject({ state: 'started', score1: 1, score2: 1, winnerId: null });
        expect((await playersOf(final))[to.slot - 1]).toBeNull();
        await enterGameResult(pool, semi1, { game: 3, winnerSlot: 2, points1: 10, points2: 15 });
        const corrected = (await getMatch(pool, semi1))!;
        expect(corrected).toMatchObject({ state: 'finished', score1: 1, score2: 2, winnerId: corrected.players[1]!.id });
        expect((await playersOf(final))[to.slot - 1]).toBe(corrected.players[1]!.id);
        // The bracket structure holds the same player.
        const slot = await pool.query(`SELECT player${to.slot}_id AS id FROM bracket_matches WHERE id = $1`, [(await getMatch(pool, final))!.bracketMatchId]);
        expect(slot.rows[0].id).toBe(corrected.players[1]!.id);
        expect(semi2).toBeGreaterThan(0);
    });

    it('reports reopened and finished events when a correction changes the winner', async () => {
        const t = await tournament('single_elimination', 2, 1);
        const [id] = t.ids;
        await win(id, 1);
        handled.calls = [];
        await enterGameResult(pool, id, { game: 1, winnerSlot: 2, points1: 0, points2: 15 });
        expect(handled.calls).toEqual([
            [
                { type: 'reopened', matchId: id, previousWinnerId: t.players[0] },
                { type: 'finished', matchId: id, winnerId: t.players[1], loserId: t.players[0], result: 'played' },
            ],
        ]);
    });

    it('refuses a correction that would move a player out of a match already called', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const [semi1, semi2, final] = t.ids;
        await win(semi1, 1);
        await win(semi2, 1);
        await callMatch(pool, final);
        expect(await enterGameResult(pool, semi1, { game: 1, winnerSlot: 2, points1: 0, points2: 15 })).toEqual({ ok: false, error: 'downstream-played', blockedBy: final });
        expect(await getMatch(pool, semi1)).toMatchObject({ state: 'finished', winnerId: (await getMatch(pool, semi1))!.players[0]!.id });
        expect((await getMatch(pool, semi1))!.games[0]).toMatchObject({ winnerSlot: 1, source: 'server' });
    });
});

describe('double elimination', () => {
    it('moves the winner and the loser to their next matches', async () => {
        const t = await tournament('double_elimination', 4);
        const first = t.ids[0];
        const winnerTo = t.next(first, 'winner')!;
        const loserTo = t.next(first, 'loser')!;
        expect(winnerTo.matchId).not.toBe(loserTo.matchId);
        const played = await win(first, 2);
        expect((await playersOf(winnerTo.matchId))[winnerTo.slot - 1]).toBe(played.players[1]!.id);
        expect((await playersOf(loserTo.matchId))[loserTo.slot - 1]).toBe(played.players[0]!.id);
        expect(handled.calls.flat().filter((e) => e.type === 'players-changed').map((e) => e.matchId).sort()).toEqual([winnerTo.matchId, loserTo.matchId].sort());
    });

    it('writes the placings when the final is decided', async () => {
        const t = await tournament('double_elimination', 4);
        // Slot 1 wins every match, so the play order decides the places.
        for (const id of t.ids) {
            if (id === t.ids.at(-1)) expect(await getPlacings(pool, t.tournamentId)).toEqual([{ place: 3, playerId: expect.any(Number) }]);
            await win(id, 1);
        }
        const final = (await getMatch(pool, t.ids.at(-1)!))!;
        const losersFinal = (await getMatch(pool, t.ids.at(-2)!))!;
        expect(await getPlacings(pool, t.tournamentId)).toEqual([
            { place: 1, playerId: final.players[0]!.id },
            { place: 2, playerId: final.players[1]!.id },
            { place: 3, playerId: losersFinal.players[1]!.id },
        ]);
    });
});

describe('single elimination placings', () => {
    it('places the third place match and updates the places after a correction of the final', async () => {
        const t = await tournament('single_elimination', 4, 1, true);
        for (const id of t.ids) await win(id, 1);
        const final = (await getMatch(pool, t.ids[2]))!;
        const third = (await getMatch(pool, t.ids[3]))!;
        expect(final.roundLabel).toBe('Final, match 1');
        expect(await getPlacings(pool, t.tournamentId)).toEqual(
            [
                { place: 1, playerId: final.players[0]!.id },
                { place: 2, playerId: final.players[1]!.id },
                { place: 3, playerId: third.players[0]!.id },
                { place: 4, playerId: third.players[1]!.id },
            ].sort((a, b) => a.place - b.place),
        );
        await enterGameResult(pool, t.ids[2], { game: 1, winnerSlot: 2, points1: 1, points2: 15 });
        expect((await getPlacings(pool, t.tournamentId)).slice(0, 2)).toEqual([
            { place: 1, playerId: final.players[1]!.id },
            { place: 2, playerId: final.players[0]!.id },
        ]);
    });
});

describe('cancel and no-show', () => {
    it('records a no-show as a forfeit and advances the bracket', async () => {
        const t = await tournament('single_elimination', 4, 3);
        const [semi1, , final] = t.ids;
        await callMatch(pool, semi1);
        const before = (await getMatch(pool, semi1))!;
        expect(await recordNoShow(pool, semi1, 1)).toMatchObject({ ok: true });
        const after = (await getMatch(pool, semi1))!;
        expect(after).toMatchObject({ state: 'finished', result: 'forfeit', winnerId: before.players[1]!.id });
        const to = t.next(semi1, 'winner')!;
        expect((await playersOf(final))[to.slot - 1]).toBe(before.players[1]!.id);
        expect(handled.calls.flat()[0]).toEqual({ type: 'finished', matchId: semi1, winnerId: before.players[1]!.id, loserId: before.players[0]!.id, result: 'forfeit' });
        // Games cannot change a forfeit, and a finished match cannot forfeit again.
        expect(await enterGameResult(pool, semi1, { game: 1, winnerSlot: 1, points1: 15, points2: 0 })).toEqual({ ok: false, error: 'forfeit' });
        expect(await recordNoShow(pool, semi1, 2)).toEqual({ ok: false, error: 'state' });
    });

    it('cancels a started 1v1 match and reports it, and refuses a finished one', async () => {
        const { players } = await activeEvent(4);
        const ids: number[] = [];
        for (const [a, b] of [
            [0, 1],
            [2, 3],
        ]) {
            const created = await createChallenge(pool, players[a], players[b]);
            if (!created.ok) throw new Error(created.error);
            await acceptChallenge(pool, created.matchId, players[b]);
            ids.push(created.matchId);
        }
        await start(ids[0]);
        expect(await cancelMatch(pool, ids[0])).toMatchObject({ ok: true, events: [{ type: 'cancelled', matchId: ids[0], reason: 'admin' }] });
        expect(await getMatch(pool, ids[0])).toMatchObject({ state: 'cancelled', cancelReason: 'admin', winnerId: null });
        expect(await report(ids[0], 1, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'state' });
        await win(ids[1], 1);
        expect(await cancelMatch(pool, ids[1])).toEqual({ ok: false, error: 'state' });
    });

    it('refuses to cancel a tournament match, so the bracket cannot stall', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const [semi1, semi2] = t.ids;
        await start(semi1);
        expect(await cancelMatch(pool, semi1)).toEqual({ ok: false, error: 'tournament-cancel' });
        expect(await cancelMatch(pool, semi2)).toEqual({ ok: false, error: 'tournament-cancel' });
        expect(await getMatch(pool, semi1)).toMatchObject({ state: 'started' });
        expect(await getMatch(pool, semi2)).toMatchObject({ state: 'upcoming' });
    });

    it('cannot forfeit a match before both players are known', async () => {
        const t = await tournament('single_elimination', 4, 1);
        expect(await recordNoShow(pool, t.ids[2], 1)).toEqual({ ok: false, error: 'players' });
    });
});

describe('calling matches', () => {
    it('calls several matches at once and refuses a match without both players', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const results = await callMatches(pool, t.ids);
        expect(results.map((r) => (r.result.ok ? 'ok' : r.result.error))).toEqual(['ok', 'ok', 'players']);
        expect((await listMatches(pool, t.eventId)).map((m) => m.state)).toEqual(['called', 'called', 'upcoming']);
    });

    it('refuses to call a match whose player is in another called match', async () => {
        const t = await tournament('single_elimination', 4, 1);
        await callMatch(pool, t.ids[0]);
        const inFirst = await playersOf(t.ids[0]);
        const busy = inFirst[0]!;
        const other = t.players.find((p) => !inFirst.includes(p))!;
        const created = await createChallenge(pool, busy, other);
        if (!created.ok) throw new Error(created.error);
        await acceptChallenge(pool, created.matchId, other);
        expect(await callMatch(pool, created.matchId)).toEqual({ ok: false, error: 'player-busy' });
    });
});

describe('reports', () => {
    it('keeps a report id once and changes nothing when it comes again', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        expect(await report(id, 1, 1, 'same')).toMatchObject({ ok: true, status: 'applied' });
        expect(await report(id, 2, 1, 'same')).toMatchObject({ ok: true, status: 'duplicate' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 1, score2: 0, nextGame: 2 });
        expect((await pool.query('SELECT count(*)::int AS n FROM game_reports')).rows[0].n).toBe(1);
    });

    it('does not let a late report change a game the admin entered', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        await enterGameResult(pool, id, { game: 1, winnerSlot: 2, points1: 4, points2: 15 });
        expect(await report(id, 1, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'game-closed' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 0, score2: 1 });
        expect((await getMatch(pool, id))!.games[0]).toMatchObject({ winnerSlot: 2, source: 'admin' });
        // A late report after the admin decided the match does not count either.
        await enterGameResult(pool, id, { game: 2, winnerSlot: 2, points1: 4, points2: 15 });
        expect(await report(id, 2, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'state' });
        expect(await getMatch(pool, id)).toMatchObject({ state: 'finished', score1: 0, score2: 2 });
    });

    it('ignores a report for a game ahead of the next one and a report for a match not called', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        expect(await report(id, 1, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'state' });
        await start(id);
        expect(await report(id, 3, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'game-ahead' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 0, nextGame: 1 });
    });

    it('starts a called match when the first result comes in', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await callMatch(pool, id);
        expect(await report(id, 1, 1)).toMatchObject({ ok: true, status: 'applied', events: [{ type: 'started', matchId: id }] });
        expect(await getMatch(pool, id)).toMatchObject({ state: 'started' });
    });

    it('refuses a report that is not well formed', async () => {
        const t = await tournament('single_elimination', 2, 3);
        expect(await reportGameResult(pool, { reportId: '', matchId: t.ids[0], game: 1, winnerSlot: 1, points1: 1, points2: 0 })).toEqual({ ok: false, error: 'invalid' });
        expect(await reportGameResult(pool, { reportId: 'x', matchId: t.ids[0], game: 0, winnerSlot: 1, points1: 1, points2: 0 })).toEqual({ ok: false, error: 'invalid' });
        expect(await reportGameResult(pool, { reportId: 'x', matchId: 999, game: 1, winnerSlot: 1, points1: 1, points2: 0 })).toEqual({ ok: false, error: 'not-found' });
    });

    it('gives one result when two reports for the same game arrive at once', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        // Opens enough connections first, so the reports really run side by side.
        await Promise.all(Array.from({ length: 8 }, () => pool.query('SELECT pg_sleep(0.05)')));
        const ids = ['a', 'b', 'b', 'c', 'd', 'e', 'f', 'g'];
        const results = await Promise.all(ids.map((reportId, i) => report(id, 1, ((i % 2) + 1) as 1 | 2, reportId)));
        const statuses = results.map((r) => (r.ok ? r.status : r.error));
        expect(statuses.filter((s) => s === 'applied')).toHaveLength(1);
        expect(statuses.filter((s) => s === 'duplicate')).toHaveLength(1);
        expect(statuses.filter((s) => s === 'ignored')).toHaveLength(6);
        const match = (await getMatch(pool, id))!;
        expect(match.games).toHaveLength(1);
        expect(match.score1 + match.score2).toBe(1);
        expect((await pool.query('SELECT count(*)::int AS n FROM game_reports')).rows[0].n).toBe(7);
    });
});

describe('1v1 matches', () => {
    it('creates a match that needs the other player to accept before it can be called', async () => {
        const { eventId, players } = await activeEvent(3);
        const created = await createChallenge(pool, players[0], players[1], { bestOf: 3 });
        if (!created.ok) throw new Error(created.error);
        expect(await getMatch(pool, created.matchId)).toMatchObject({ eventId, tournamentId: null, roundLabel: null, state: 'upcoming', bestOf: 3, acceptedAt: null });
        expect(await callMatch(pool, created.matchId)).toEqual({ ok: false, error: 'not-accepted' });
        expect(await acceptChallenge(pool, created.matchId, players[0])).toEqual({ ok: false, error: 'not-allowed' });
        expect(await acceptChallenge(pool, created.matchId, players[1])).toMatchObject({ ok: true });
        expect((await getMatch(pool, created.matchId))!.acceptedAt).toBeInstanceOf(Date);
        expect(await acceptChallenge(pool, created.matchId, players[1])).toEqual({ ok: false, error: 'state' });
        await start(created.matchId);
        await report(created.matchId, 1, 2);
        await report(created.matchId, 2, 2);
        expect(await getMatch(pool, created.matchId)).toMatchObject({ state: 'finished', winnerId: players[1] });
    });

    it('cancels the match when the other player declines, and frees the pair', async () => {
        const { players } = await activeEvent(2);
        const created = await createChallenge(pool, players[0], players[1]);
        if (!created.ok) throw new Error(created.error);
        expect(await createChallenge(pool, players[1], players[0])).toEqual({ ok: false, error: 'taken' });
        expect(await declineChallenge(pool, created.matchId, players[0])).toEqual({ ok: false, error: 'not-allowed' });
        expect(await declineChallenge(pool, created.matchId, players[1])).toMatchObject({ ok: true, events: [{ type: 'cancelled', matchId: created.matchId, reason: 'declined' }] });
        expect(await getMatch(pool, created.matchId)).toMatchObject({ state: 'cancelled', cancelReason: 'declined' });
        expect(await acceptChallenge(pool, created.matchId, players[1])).toEqual({ ok: false, error: 'state' });
        expect(await createChallenge(pool, players[1], players[0])).toMatchObject({ ok: true });
    });

    it('lets an admin cancel an accepted 1v1 match', async () => {
        const { players } = await activeEvent(2);
        const created = await createChallenge(pool, players[0], players[1]);
        if (!created.ok) throw new Error(created.error);
        await acceptChallenge(pool, created.matchId, players[1]);
        expect(await cancelMatch(pool, created.matchId)).toMatchObject({ ok: true });
        expect(await getMatch(pool, created.matchId)).toMatchObject({ state: 'cancelled', cancelReason: 'admin' });
    });

    it('refuses the same player, players of another event, an inactive event and bad settings', async () => {
        const { players } = await activeEvent(2);
        const otherEvent = await createEvent(pool, { ...lan, code: 'LAN-2025' });
        const [stranger] = await addPlayers(otherEvent, 1, 'X');
        expect(await createChallenge(pool, players[0], players[0])).toEqual({ ok: false, error: 'players' });
        expect(await createChallenge(pool, players[0], stranger)).toEqual({ ok: false, error: 'no-event' });
        expect(await createChallenge(pool, players[0], players[1], { bestOf: 2 })).toEqual({ ok: false, error: 'settings' });
        expect(await createChallenge(pool, players[0], players[1], { ruleFile: '../x.lua' })).toEqual({ ok: false, error: 'settings' });
        const created = await createChallenge(pool, players[0], players[1]);
        if (!created.ok) throw new Error(created.error);
        await pool.query('UPDATE events SET is_active = false');
        expect(await acceptChallenge(pool, created.matchId, players[1])).toEqual({ ok: false, error: 'no-event' });
        expect(await createChallenge(pool, players[1], stranger)).toEqual({ ok: false, error: 'no-event' });
    });
});

describe('reset to upcoming', () => {
    it('clears the games and the manual score, reports the reset and ignores late reports for cleared games', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        await report(id, 1, 1);
        await report(id, 2, null);
        await setSeriesScore(pool, id, 1, 1);
        handled.calls = [];
        const reset = { type: 'reset', matchId: id, previousWinnerId: null, previousResult: null };
        expect(await resetMatch(pool, id)).toMatchObject({ ok: true, events: [reset] });
        expect(handled.calls).toEqual([[reset]]);
        // Games 1 and 2 are cleared, and game 3 may have been in progress, so the series goes on with game 4.
        expect(await getMatch(pool, id)).toMatchObject({ state: 'upcoming', score1: 0, score2: 0, manualScore: null, games: [], nextGame: 4, awaitingDecision: false, calledAt: null, startedAt: null });
        expect(await report(id, 4, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'state' });
        await start(id);
        expect(await report(id, 1, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'game-closed' });
        expect(await enterGameResult(pool, id, { game: 2, winnerSlot: 1, points1: 15, points2: 3 })).toEqual({ ok: false, error: 'game' });
        expect(await report(id, 4, 2)).toMatchObject({ ok: true, status: 'applied' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 0, score2: 1, nextGame: 5 });
    });

    it('skips the game that was in progress when a started match is reset', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        // Game 1 is being played and not stored yet when the admin resets the match.
        expect(await resetMatch(pool, id)).toMatchObject({ ok: true });
        expect(await getMatch(pool, id)).toMatchObject({ nextGame: 2 });
        await start(id);
        expect(await report(id, 1, 1)).toMatchObject({ ok: true, status: 'ignored', reason: 'game-closed' });
        expect(await getMatch(pool, id)).toMatchObject({ score1: 0, score2: 0, games: [] });
        expect(await report(id, 2, 1)).toMatchObject({ ok: true, status: 'applied' });
    });

    it('does not skip a game number when a called match is reset', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await callMatch(pool, id);
        expect(await resetMatch(pool, id)).toMatchObject({ ok: true });
        expect(await getMatch(pool, id)).toMatchObject({ nextGame: 1 });
    });

    it('reports a forfeit as the previous result, so betting does not refund twice', async () => {
        const t = await tournament('single_elimination', 2, 1);
        const [id] = t.ids;
        await callMatch(pool, id);
        await recordNoShow(pool, id, 1);
        expect(await resetMatch(pool, id)).toMatchObject({ ok: true, events: [{ type: 'reset', matchId: id, previousWinnerId: t.players[1], previousResult: 'forfeit' }] });
        expect(await getMatch(pool, id)).toMatchObject({ state: 'upcoming', result: null, winnerId: null });
    });

    it('names the later match that blocks a correction and lets the correction through once it is reset', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const [semi1, semi2, final] = t.ids;
        await win(semi1, 1);
        await win(semi2, 1);
        await callMatch(pool, final);
        const correction = { game: 1, winnerSlot: 2 as const, points1: 0, points2: 15 };
        expect(await enterGameResult(pool, semi1, correction)).toEqual({ ok: false, error: 'downstream-played', blockedBy: final });
        expect(await resetMatch(pool, final)).toMatchObject({ ok: true });
        handled.calls = [];
        expect(await enterGameResult(pool, semi1, correction)).toMatchObject({ ok: true });
        const corrected = (await getMatch(pool, semi1))!;
        const to = t.next(semi1, 'winner')!;
        expect((await playersOf(final))[to.slot - 1]).toBe(corrected.players[1]!.id);
        expect(handled.calls.flat().map((e) => e.type)).toEqual(['reopened', 'finished', 'players-changed']);
    });

    it('takes the winner of a reset match back out of the bracket and the placings', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const [semi1, semi2, final] = t.ids;
        await win(semi1, 1);
        await win(semi2, 1);
        const decided = await win(final, 2);
        expect(await resetMatch(pool, semi1)).toEqual({ ok: false, error: 'downstream-played', blockedBy: final });
        expect(await resetMatch(pool, final)).toMatchObject({ ok: true, events: [{ type: 'reset', matchId: final, previousWinnerId: decided.players[1]!.id, previousResult: 'played' }] });
        expect((await getPlacings(pool, t.tournamentId)).map((p) => p.place)).toEqual([3, 3]);
        expect(await resetMatch(pool, semi1)).toMatchObject({ ok: true });
        expect((await playersOf(final))[t.next(semi1, 'winner')!.slot - 1]).toBeNull();
        expect(await getMatch(pool, semi1)).toMatchObject({ state: 'upcoming', winnerId: null, result: null });
    });

    it('refuses an upcoming or cancelled match', async () => {
        const t = await tournament('single_elimination', 2, 1);
        expect(await resetMatch(pool, t.ids[0])).toEqual({ ok: false, error: 'state' });
    });
});

/** Runs the work in a transaction on one client, as betting will. */
async function inTx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } finally {
        client.release();
    }
}

describe('withMatchForBet', () => {
    it('is open for an upcoming or called match with both players and closed otherwise', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const [semi1, , final] = t.ids;
        expect(await inTx((c) => withMatchForBet(c, semi1))).toMatchObject({ ok: true, match: { id: semi1, eventId: t.eventId, tournamentId: t.tournamentId, state: 'upcoming' } });
        expect(await inTx((c) => withMatchForBet(c, final))).toEqual({ ok: false, error: 'closed' });
        await callMatch(pool, semi1);
        expect(await inTx((c) => withMatchForBet(c, semi1))).toMatchObject({ ok: true, match: { state: 'called' } });
        await reportPlayersConnected(pool, semi1);
        expect(await inTx((c) => withMatchForBet(c, semi1))).toEqual({ ok: false, error: 'closed' });
        expect(await inTx((c) => withMatchForBet(c, 999))).toEqual({ ok: false, error: 'not-found' });
        const created = await createChallenge(pool, t.players[0], t.players[3]);
        if (!created.ok) throw new Error(created.error);
        expect(await inTx((c) => withMatchForBet(c, created.matchId))).toEqual({ ok: false, error: 'closed' });
    });

    it('holds the match, so it cannot start while a bet is being written', async () => {
        const t = await tournament('single_elimination', 2, 1);
        const [id] = t.ids;
        await callMatch(pool, id);
        const client = await pool.connect();
        let started = false;
        try {
            await client.query('BEGIN');
            expect(await withMatchForBet(client, id)).toMatchObject({ ok: true });
            const starting = reportPlayersConnected(pool, id).then((r) => {
                started = true;
                return r;
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(started).toBe(false);
            await client.query('COMMIT');
            expect(await starting).toMatchObject({ ok: true, started: true });
        } finally {
            client.release();
        }
        expect(await inTx((c) => withMatchForBet(c, id))).toEqual({ ok: false, error: 'closed' });
    });
});

describe('fix round checks', () => {
    it('calls only one of several matches that share a player when they are called at once', async () => {
        const { players } = await activeEvent(7);
        const ids: number[] = [];
        for (const opponent of players.slice(1)) {
            const created = await createChallenge(pool, players[0], opponent);
            if (!created.ok) throw new Error(created.error);
            await acceptChallenge(pool, created.matchId, opponent);
            ids.push(created.matchId);
        }
        await Promise.all(Array.from({ length: 8 }, () => pool.query('SELECT pg_sleep(0.05)')));
        const results = await Promise.all(ids.map((id) => callMatch(pool, id)));
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(results.filter((r) => !r.ok && r.error === 'player-busy')).toHaveLength(ids.length - 1);
    });

    it('refuses a game result where the winner does not have more points', async () => {
        const t = await tournament('single_elimination', 2, 3);
        const [id] = t.ids;
        await start(id);
        expect(await enterGameResult(pool, id, { game: 1, winnerSlot: 1, points1: 10, points2: 15 })).toEqual({ ok: false, error: 'score' });
        expect(await enterGameResult(pool, id, { game: 1, winnerSlot: 2, points1: 15, points2: 15 })).toEqual({ ok: false, error: 'score' });
        expect(await reportGameResult(pool, { reportId: 'low', matchId: id, game: 1, winnerSlot: 2, points1: 15, points2: 3 })).toEqual({ ok: false, error: 'invalid' });
        expect(await reportGameResult(pool, { reportId: 'even', matchId: id, game: 1, winnerSlot: 1, points1: 7, points2: 7 })).toEqual({ ok: false, error: 'invalid' });
        expect(await getMatch(pool, id)).toMatchObject({ games: [], score1: 0, score2: 0 });
        // An abandoned game has no winner, so equal points are fine.
        expect(await reportGameResult(pool, { reportId: 'abandoned', matchId: id, game: 1, winnerSlot: null, points1: 7, points2: 7 })).toMatchObject({ ok: true, status: 'applied' });
    });
});

describe('betting hook', () => {
    it('rolls the whole change back when the hook throws', async () => {
        const t = await tournament('single_elimination', 4, 1);
        const [semi1, , final] = t.ids;
        await start(semi1);
        handled.fail = true;
        await expect(report(semi1, 1, 1, 'rolled-back')).rejects.toThrow('settlement failed');
        handled.fail = false;
        expect(await getMatch(pool, semi1)).toMatchObject({ state: 'started', score1: 0, games: [] });
        expect(await playersOf(final)).toEqual([null, null]);
        expect((await pool.query('SELECT count(*)::int AS n FROM game_reports')).rows[0].n).toBe(0);
        // The same report id is new again, since nothing was kept.
        expect(await report(semi1, 1, 1, 'rolled-back')).toMatchObject({ ok: true, status: 'applied' });
    });
});

describe('migration', () => {
    it('adds a match row for each bracket match saved before it ran', async () => {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        const dir = mkdtempSync(join(tmpdir(), 'bvt-migrations-'));
        try {
            for (const { name } of readMigrations().filter((m) => m.name < '0004')) copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
            await migrate(pool, dir);
            const eventId = await createEvent(pool, lan);
            const [a, b] = await addPlayers(eventId, 2);
            const t = await pool.query<{ id: number }>(`INSERT INTO tournaments (event_id, name, format, seeding) VALUES ($1, 'Old', 'single_elimination', 'manual') RETURNING id`, [eventId]);
            await pool.query('INSERT INTO tournament_players (tournament_id, event_id, player_id, seed) VALUES ($1, $2, $3, 1), ($1, $2, $4, 2)', [t.rows[0].id, eventId, a, b]);
            await pool.query(`INSERT INTO bracket_matches (tournament_id, section, round, position, best_of, rule_file, player1_id, player2_id) VALUES ($1, 'winners', 1, 1, 3, 'old.lua', $2, $3)`, [t.rows[0].id, a, b]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
        await migrate(pool);
        const matches = await listMatches(pool, (await pool.query('SELECT id FROM events')).rows[0].id);
        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ state: 'upcoming', bestOf: 3, ruleFile: 'old.lua', tournamentName: 'Old', roundLabel: 'Final, match 1' });
        expect(matches[0].players.map((p) => p?.nickname)).toEqual(['P1', 'P2']);
    });
});

