import { describe, expect, it } from 'vitest';
import { parseGameReport, parseLive, parseTrainingReport } from './input';
import { readStats } from './stats';

const stats = () => ({
    players: [
        { playerId: 12, ballSteps: 4120, touches: 31, errors: 2, netHits: 1 },
        { playerId: 7, ballSteps: 3480, touches: 27, errors: 4, netHits: 0 },
    ],
    rallies: 14,
    longestRally: 9,
    rallyTouches: 58,
});

describe('readStats', () => {
    it('returns the block of the contract', () => {
        expect(readStats(stats(), [12, 7])).toEqual(stats());
    });

    it('returns null when the block is missing or not an object', () => {
        expect(readStats(undefined, [12, 7])).toBeNull();
        expect(readStats(null, [12, 7])).toBeNull();
        expect(readStats([], [12, 7])).toBeNull();
    });

    it('returns null for three players, other ids or a repeated id', () => {
        const three = { ...stats(), players: [...stats().players, stats().players[0]] };
        expect(readStats(three, [12, 7])).toBeNull();
        expect(readStats(stats(), [12, 8])).toBeNull();
        expect(readStats(stats(), [12, 7, 3])).toBeNull();
        const same = { ...stats(), players: [stats().players[0], stats().players[0]] };
        expect(readStats(same, [12, 12])).toBeNull();
    });

    it('returns null for a number that is not an integer from 0 to 10000000', () => {
        for (const bad of [1.5, -1, 10_000_001, '3', null, Number.NaN]) {
            expect(readStats({ ...stats(), rallies: bad }, [12, 7])).toBeNull();
            const s = stats();
            (s.players[1] as Record<string, unknown>).errors = bad;
            expect(readStats(s, [12, 7])).toBeNull();
        }
        expect(readStats({ ...stats(), rallies: 10_000_000, longestRally: 0 }, [12, 7])).toMatchObject({ rallies: 10_000_000 });
    });

    it('returns null when the longest rally is above the touches of the rallies', () => {
        expect(readStats({ ...stats(), longestRally: 59 }, [12, 7])).toBeNull();
        expect(readStats({ ...stats(), longestRally: 58 }, [12, 7])).not.toBeNull();
    });

    it('keeps only the known fields', () => {
        const s = { ...stats(), extra: 1 };
        expect(readStats(s, [12, 7])).toEqual(stats());
    });
});

describe('the parsers', () => {
    const base = { reportId: '00000000-0000-4000-8000-000000000001', matchId: 1, game: 1, status: 'finished', winnerId: 12, startedAt: '2026-11-20T18:00:00Z', endedAt: '2026-11-20T18:05:00Z' };
    const points = [
        { playerId: 12, points: 15 },
        { playerId: 7, points: 4 },
    ];

    it('gives the stats of a game report, and null for a bad block without refusing the report', () => {
        expect(parseGameReport({ ...base, points, stats: stats() })).toMatchObject({ ok: true, value: { stats: stats() } });
        expect(parseGameReport({ ...base, points })).toMatchObject({ ok: true, value: { stats: null } });
        expect(parseGameReport({ ...base, points, stats: { ...stats(), rallies: -1 } })).toMatchObject({ ok: true, value: { stats: null } });
        expect(parseGameReport({ ...base, points, stats: 'x' })).toMatchObject({ ok: true, value: { stats: null } });
    });

    it('gives the stats of a training report with the bot as player 0', () => {
        const s = stats();
        s.players[1].playerId = 0;
        const bot = [
            { playerId: 12, points: 15 },
            { playerId: 0, points: 4 },
        ];
        expect(parseTrainingReport({ ...base, training: true, points: bot, stats: s })).toMatchObject({ ok: true, value: { stats: s } });
        expect(parseTrainingReport({ ...base, training: true, points: bot, stats: stats() })).toMatchObject({ ok: true, value: { stats: null } });
    });

    it('gives the stats of a live body', () => {
        expect(parseLive({ matchId: 1, game: 1, points, stats: stats() })).toMatchObject({ ok: true, value: { stats: stats() } });
        expect(parseLive({ matchId: 1, game: 1, points })).toMatchObject({ ok: true, value: { stats: null } });
    });
});
