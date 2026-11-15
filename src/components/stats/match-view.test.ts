import { describe, expect, it } from 'vitest';
import type { GameStats } from '@/lib/game-server/stats';
import { gameLines, pointsInOrder } from './match-view';

const stats: GameStats = {
    players: [
        { playerId: 7, ballSteps: 3000, touches: 27, errors: 4, netHits: 0 },
        { playerId: 12, ballSteps: 1000, touches: 31, errors: 2, netHits: 1 },
    ],
    rallies: 10,
    longestRally: 9,
    rallyTouches: 58,
};

describe('match view', () => {
    it('puts the sides in the order of the player ids and not the order of the body', () => {
        const lines = gameLines(stats, [12, 7]);
        expect(lines?.players[0]).toEqual({ possession: 0.25, touches: 31, errors: 2, netHits: 1 });
        expect(lines?.players[1]).toEqual({ possession: 0.75, touches: 27, errors: 4, netHits: 0 });
        expect(lines).toMatchObject({ rallies: 10, longestRally: 9, averageRally: 5.8 });
    });

    it('gives null for stats of other players or no stats', () => {
        expect(gameLines(stats, [12, 8])).toBeNull();
        expect(gameLines(stats, [null, 7])).toBeNull();
        expect(gameLines(stats, [7, 7])).toBeNull();
        expect(gameLines(null, [12, 7])).toBeNull();
    });

    it('has no averages without rallies and no possession without ball steps', () => {
        const none: GameStats = { players: [{ ...stats.players[0], ballSteps: 0 }, { ...stats.players[1], ballSteps: 0 }], rallies: 0, longestRally: 0, rallyTouches: 0 };
        const lines = gameLines(none, [7, 12]);
        expect(lines).toMatchObject({ longestRally: null, averageRally: null });
        expect(lines?.players[0].possession).toBeNull();
    });

    it('puts live points in the order of the ids', () => {
        const live = [{ playerId: 7, points: 3 }, { playerId: 12, points: 8 }];
        expect(pointsInOrder(live, [12, 7])).toEqual([8, 3]);
        expect(pointsInOrder(live, [12, 9])).toBeNull();
    });
});
