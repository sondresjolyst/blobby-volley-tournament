// Puts the stats and points of a game in the order of the match page. The sides are found by player id.
import type { GameStats, PlayerGameStats } from '@/lib/game-server/stats';
import type { PlayerStatLine } from '@/lib/store/game-stats';

export type PlayerIds = readonly [number | null, number | null];

export interface GameLines {
    players: [PlayerStatLine, PlayerStatLine];
    rallies: number;
    longestRally: number | null;
    averageRally: number | null;
}

const find = <T extends { playerId: number }>(items: readonly T[], id: number | null) => (id === null ? undefined : items.find((i) => i.playerId === id));

/** The two players of the stats in the order of the ids, or null when the stats are not of exactly these two players. */
export function playersInOrder(stats: GameStats, ids: PlayerIds): [PlayerGameStats, PlayerGameStats] | null {
    const first = find(stats.players, ids[0]);
    const second = find(stats.players, ids[1]);
    return first && second && first !== second ? [first, second] : null;
}

/** The points of a live score in the order of the ids, or null when they are not of exactly these two players. */
export function pointsInOrder(points: readonly { playerId: number; points: number }[], ids: PlayerIds): [number, number] | null {
    const first = find(points, ids[0]);
    const second = find(points, ids[1]);
    return first && second && first !== second ? [first.points, second.points] : null;
}

/** What the cards of one game show, with the sides in the order of the ids. Null without matching stats. */
export function gameLines(stats: GameStats | null, ids: PlayerIds): GameLines | null {
    const players = stats ? playersInOrder(stats, ids) : null;
    if (!stats || !players) return null;
    const steps = players[0].ballSteps + players[1].ballSteps;
    const side = (p: PlayerGameStats): PlayerStatLine => ({ possession: steps > 0 ? p.ballSteps / steps : null, touches: p.touches, errors: p.errors, netHits: p.netHits });
    return {
        players: [side(players[0]), side(players[1])],
        rallies: stats.rallies,
        longestRally: stats.rallies > 0 ? stats.longestRally : null,
        averageRally: stats.rallies > 0 ? stats.rallyTouches / stats.rallies : null,
    };
}
