// The final stats of a game, as the game server reports them. A bad block is dropped whole.

/** The largest number a stat can hold. */
export const MAX_STAT = 10_000_000;

export interface PlayerGameStats {
    playerId: number;
    ballSteps: number;
    touches: number;
    errors: number;
    netHits: number;
}

export interface GameStats {
    /** In the order of the points of the report. */
    players: [PlayerGameStats, PlayerGameStats];
    rallies: number;
    longestRally: number;
    rallyTouches: number;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const MAX_ID = 2_147_483_647;
/** A player id as the game server sends it. 0 is the bot of a training match. */
const isPlayerId = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_ID;
const isStat = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_STAT;

function readPlayer(value: unknown): PlayerGameStats | null {
    if (!isObject(value)) return null;
    const { playerId, ballSteps, touches, errors, netHits } = value;
    if (!isPlayerId(playerId) || !isStat(ballSteps) || !isStat(touches) || !isStat(errors) || !isStat(netHits)) return null;
    return { playerId, ballSteps, touches, errors, netHits };
}

/**
 * Reads the `stats` block of a report. It has two players with the ids of the points, and every
 * number is an integer from 0 to 10000000. The longest rally cannot be above the touches of all
 * rallies. Anything else gives null, and the report is handled as if it had no stats.
 */
export function readStats(value: unknown, playerIds: readonly number[]): GameStats | null {
    if (!isObject(value) || playerIds.length !== 2 || !Array.isArray(value.players) || value.players.length !== 2) return null;
    const first = readPlayer(value.players[0]);
    const second = readPlayer(value.players[1]);
    if (!first || !second) return null;
    if (first.playerId !== playerIds[0] || second.playerId !== playerIds[1] || first.playerId === second.playerId) return null;
    const { rallies, longestRally, rallyTouches } = value;
    if (!isStat(rallies) || !isStat(longestRally) || !isStat(rallyTouches) || longestRally > rallyTouches) return null;
    return { players: [first, second], rallies, longestRally, rallyTouches };
}

/**
 * The stats with the players in the order of the two ids, or null when the ids are not exactly
 * these two. A game has its stats in slot order: player 1 first, and for training the player first.
 */
export function inOrder(stats: GameStats | null | undefined, first: number, second: number): GameStats | null {
    if (!stats) return null;
    const [a, b] = stats.players;
    if (a.playerId === first && b.playerId === second) return stats;
    if (a.playerId === second && b.playerId === first) return { ...stats, players: [b, a] };
    return null;
}
