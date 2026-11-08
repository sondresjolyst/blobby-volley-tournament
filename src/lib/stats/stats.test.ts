import { describe, expect, it } from 'vitest';
import { bettorStats, compareCorrect, compareNet, type SettledBet } from './betting';
import { ELO_K, ELO_START, eloChanges, expectedScore, replayElo, shownRating, winnerGain, type RatedMatch } from './elo';
import { compareWins, playerStats, type PlayedMatch } from './players';

const rated = (matchId: number, winner: string, loser: string, eventId = 1, tournamentId: number | null = null): RatedMatch => ({ matchId, eventId, tournamentId, winner, loser });

describe('Elo', () => {
    it('starts at 1000 with a K factor of 32', () => {
        expect(ELO_START).toBe(1000);
        expect(ELO_K).toBe(32);
    });

    it('gives half the K factor for a win between equal ratings', () => {
        expect(expectedScore(1000, 1000)).toBe(0.5);
        const { ratings } = replayElo([rated(1, 'a', 'b')]);
        expect(ratings.get('a')).toBe(1016);
        expect(ratings.get('b')).toBe(984);
    });

    it('gives less for beating a weaker player and more for beating a stronger one', () => {
        expect(winnerGain(1200, 1000)).toBeCloseTo(32 * (1 - 1 / (1 + 10 ** (-200 / 400))), 10);
        expect(winnerGain(1200, 1000)).toBeLessThan(16);
        expect(winnerGain(1000, 1200)).toBeGreaterThan(16);
        expect(winnerGain(1000, 1200) + winnerGain(1200, 1000)).toBeCloseTo(32, 10);
    });

    it('plays the matches in order, so the same results in another order give other ratings', () => {
        const first = replayElo([rated(1, 'a', 'b'), rated(2, 'c', 'a')]).ratings;
        const second = replayElo([rated(2, 'c', 'a'), rated(1, 'a', 'b')]).ratings;
        expect(shownRating(first.get('a')!)).toBe(999);
        expect(shownRating(second.get('a')!)).toBe(1001);
    });

    it('keeps the total of all ratings the same', () => {
        const { ratings } = replayElo([rated(1, 'a', 'b'), rated(2, 'b', 'c'), rated(3, 'c', 'a'), rated(4, 'a', 'c')]);
        expect([...ratings.values()].reduce((s, r) => s + r, 0)).toBeCloseTo(3000, 10);
    });

    it('sums the change of each player over the matches in scope', () => {
        const replay = replayElo([rated(1, 'a', 'b', 1), rated(2, 'a', 'b', 2, 7), rated(3, 'b', 'a', 2)]);
        const inEvent2 = eloChanges(replay, (m) => m.eventId === 2);
        const ratings = replay.ratings;
        const before = replayElo([rated(1, 'a', 'b', 1)]).ratings;
        expect(inEvent2.get('a')).toBeCloseTo(ratings.get('a')! - before.get('a')!, 10);
        const inTournament = eloChanges(replay, (m) => m.tournamentId === 7);
        expect(inTournament.get('a')).toBeCloseTo(winnerGain(1016, 984), 10);
        expect(inTournament.get('b')).toBeCloseTo(-winnerGain(1016, 984), 10);
    });
});

const played = (matchId: number, players: [number, number], winnerId: number, score: [number, number], points: [number, number]): PlayedMatch => ({ matchId, tournamentId: null, players, winnerId, score, points });

describe('playerStats', () => {
    const matches = [
        played(1, [1, 2], 1, [2, 1], [40, 30]),
        played(2, [1, 3], 1, [1, 0], [15, 3]),
        played(3, [2, 1], 2, [1, 0], [15, 9]),
        played(4, [1, 2], 1, [1, 0], [15, 14]),
        played(5, [3, 1], 1, [0, 1], [4, 15]),
    ];
    const stats = playerStats(matches);

    it('counts matches, games and points from both sides', () => {
        expect(stats.get(1)).toMatchObject({ matchesWon: 4, matchesLost: 1, gamesWon: 5, gamesLost: 2, pointsScored: 94, pointsConceded: 66 });
        expect(stats.get(1)!.winRate).toBeCloseTo(0.8, 10);
        expect(stats.get(3)).toMatchObject({ matchesWon: 0, matchesLost: 2, gamesWon: 0, gamesLost: 2, pointsScored: 7, pointsConceded: 30, winRate: 0, longestStreak: 0 });
    });

    it('finds the longest run of wins', () => {
        expect(stats.get(1)!.longestStreak).toBe(2);
        expect(stats.get(2)!.longestStreak).toBe(1);
    });

    it('keeps a head to head record per opponent, the most played first', () => {
        expect(stats.get(1)!.headToHead).toEqual([
            { opponentId: 2, won: 2, lost: 1 },
            { opponentId: 3, won: 2, lost: 0 },
        ]);
    });

    it('ranks the most wins first, then the win rate', () => {
        const ranked = [...stats.values()].sort(compareWins).map((s) => s.playerId);
        expect(ranked).toEqual([1, 2, 3]);
    });
});

const settled = (betId: number, bettorId: number, status: SettledBet['status'], amount: number, payout = 0, onPlayerId = 9, matchId = betId): SettledBet => ({ betId, matchId, bettorId, onPlayerId, amount, status, payout });

describe('bettorStats', () => {
    const stats = bettorStats([
        settled(1, 1, 'won', 100, 150),
        settled(2, 1, 'lost', 40),
        settled(3, 1, 'returned', 30),
        settled(4, 1, 'won', 10, 42, 8),
        settled(5, 2, 'won', 500, 600),
        settled(6, 3, 'lost', 200),
    ]);

    it('counts correct bets and the hit rate, with a returned stake as a miss', () => {
        expect(stats.get(1)).toMatchObject({ bets: 4, correct: 2, hitRate: 0.5 });
    });

    it('adds up the Foza won and lost', () => {
        expect(stats.get(1)).toMatchObject({ fozaWon: 82, fozaLost: 40, net: 42 });
        expect(stats.get(3)).toMatchObject({ bets: 1, correct: 0, fozaWon: 0, fozaLost: 200, net: -200, biggestWin: null, bestOdds: null });
    });

    it('finds the biggest win and the best odds hit, which can be different bets', () => {
        expect(stats.get(1)!.biggestWin).toEqual({ matchId: 1, onPlayerId: 9, value: 50 });
        expect(stats.get(1)!.bestOdds).toEqual({ matchId: 4, onPlayerId: 8, value: 4.2 });
    });

    it('ranks by correct bets, not by Foza', () => {
        const ranked = [...stats.values()].sort(compareCorrect).map((s) => s.playerId);
        expect(ranked).toEqual([1, 2, 3]);
        expect(stats.get(2)!.net).toBeGreaterThan(stats.get(1)!.net);
    });

    it('ranks the Foza boards by Foza won net, with correct bets on a tie', () => {
        expect([...stats.values()].sort(compareNet).map((s) => s.playerId)).toEqual([2, 1, 3]);
        const a = { ...stats.get(1)!, net: 10, correct: 1 };
        const b = { ...stats.get(1)!, net: 10, correct: 3 };
        expect([a, b].sort(compareNet)).toEqual([b, a]);
    });
});
