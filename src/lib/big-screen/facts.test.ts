import { describe, expect, it } from 'vitest';
import type { PlayerStats } from '@/lib/stats/players';
import type { Leaderboard } from '@/lib/store/stats';
import { comeback, countedGames, matchLength, screenFacts, type PlayedSeries } from './facts';

const names = new Map([
    [11, 'Blobfisk'],
    [12, 'Skvett'],
    [13, 'Ostebit'],
]);

function stats(playerId: number, extra: Partial<PlayerStats> = {}): PlayerStats {
    return { playerId, matchesWon: 0, matchesLost: 0, gamesWon: 0, gamesLost: 0, winRate: null, pointsScored: 0, pointsConceded: 0, longestStreak: 0, headToHead: [], ...extra };
}

function board(wins: PlayerStats[] = []): Leaderboard {
    return { eventId: 1, tournamentId: null, nicknames: names, wins, bettors: [], elo: [], placings: [] };
}

const game = (winnerSlot: 1 | 2, a: number, b: number) => ({ winnerSlot, points: [a, b] as [number, number] });

function series(matchId: number, players: [number, number], winnerId: number | null, games: PlayedSeries['games'], extra: Partial<PlayedSeries> = {}): PlayedSeries {
    return { matchId, players, bestOf: 5, winnerId, games, manual: false, seconds: null, ...extra };
}

describe('comeback', () => {
    it('finds the deepest hole the winner climbed out of', () => {
        expect(comeback(series(1, [11, 12], 12, [game(1, 15, 3), game(1, 15, 9), game(2, 13, 15), game(2, 10, 15), game(2, 12, 15)]))).toEqual({ behind: 2, at: [0, 2], end: [3, 2] });
        expect(comeback(series(1, [11, 12], 11, [game(1, 15, 3), game(1, 15, 9)]))).toBeNull();
    });

    it('says nothing while the series is going or after a score set by hand', () => {
        expect(comeback(series(1, [11, 12], null, [game(2, 1, 15), game(1, 15, 1)]))).toBeNull();
        expect(comeback(series(1, [11, 12], 11, [game(2, 1, 15), game(1, 15, 1), game(1, 15, 2)], { manual: true }))).toBeNull();
    });
});

describe('countedGames', () => {
    it('stops at the game that decided the series', () => {
        const games = [game(1, 15, 3), game(2, 1, 15), game(2, 0, 15)];
        expect(countedGames({ bestOf: 1, games })).toEqual(games.slice(0, 1));
        expect(countedGames({ bestOf: 3, games })).toEqual(games);
    });

    it('leaves a game after the end out of the records', () => {
        const played = [series(1, [11, 12], 11, [game(1, 15, 9), game(2, 0, 15)], { bestOf: 1 })];
        expect(comeback(played[0])).toBeNull();
        expect(screenFacts(board(), played)).toEqual([{ key: 'biggestWin', label: 'Største siger i eit sett', value: '15–9', who: 'Blobfisk mot Skvett' }]);
    });
});

describe('matchLength', () => {
    it('writes minutes, and hours from an hour', () => {
        expect(matchLength(61)).toBe('1 min');
        expect(matchLength(23 * 60 + 20)).toBe('23 min');
        expect(matchLength(65 * 60)).toBe('1 t 05 min');
    });
});

describe('screenFacts', () => {
    it('is empty with nothing played', () => {
        expect(screenFacts(board(), [])).toEqual([]);
        expect(screenFacts(board([stats(11)]), [series(1, [11, 12], null, [])])).toEqual([]);
    });

    it('finds every record that has something to show', () => {
        const played = [
            series(1, [11, 12], 11, [game(1, 15, 9)], { seconds: 7 * 60 }),
            series(2, [12, 13], 12, [game(2, 0, 15), game(1, 15, 10), game(1, 15, 12)], { seconds: 31 * 60 }),
            series(3, [11, 13], 13, [game(2, 14, 16)], { seconds: 20 }),
            series(4, [11, 12], null, [game(2, 3, 15)]),
        ];
        const wins = [stats(12, { matchesWon: 3, longestStreak: 3, pointsScored: 1234 }), stats(11, { matchesWon: 1, longestStreak: 1, pointsScored: 40 })];
        expect(screenFacts(board(wins), played)).toEqual([
            { key: 'wins', label: 'Flest sigra', value: '3 sigra', who: 'Skvett' },
            { key: 'biggestWin', label: 'Største siger i eit sett', value: '15–0', who: 'Ostebit mot Skvett' },
            { key: 'comeback', label: 'Største snuoperasjon', value: '0–1 te 2–1', who: 'Skvett mot Ostebit' },
            { key: 'longest', label: 'Lengste kamp', value: '31 min', who: 'Skvett mot Ostebit' },
            { key: 'streak', label: 'Lengste rekke', value: '3 sigra på rad', who: 'Skvett' },
            { key: 'points', label: 'Flest poeng', value: `${new Intl.NumberFormat('nb-NO').format(1234)} poeng`, who: 'Skvett' },
        ]);
    });

    it('leaves out a match entered by hand in under a minute, a streak of one and games with unknown points', () => {
        const played = [series(1, [11, 12], 11, [game(1, 0, 0)], { seconds: 5 })];
        expect(screenFacts(board([stats(11, { matchesWon: 1, longestStreak: 1 })]), played).map((f) => f.key)).toEqual(['wins']);
    });
});
