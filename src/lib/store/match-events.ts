import type { PoolClient } from 'pg';

/**
 * What a match change did. Every change in src/lib/store/matches.ts passes its events to
 * handleMatchEvents before it commits.
 * - started: bets close.
 * - finished: the match has a winner. A forfeit comes from a no-show, so its bets are refunded.
 * - reopened: a correction took back the result of a finished match. A new finished event follows
 *   when the correction gives the match another winner.
 * - cancelled: an admin cancelled the match, or player 2 declined a 1v1 match. Bets are refunded.
 * - players-changed: a correction moved another player into a match that has not been called yet.
 *   Bets on the old pairing are refunded.
 * - reset: an admin sent the match back to upcoming and cleared its games. Bets on it are refunded,
 *   and a settlement is reversed when previousWinnerId is set. New bets can be placed again.
 *
 * Placing a bet must call withMatchForBet from matches.ts first, in the same transaction, so a
 * bet and a match change never interleave.
 */
export type MatchEvent =
    | { type: 'started'; matchId: number }
    | { type: 'finished'; matchId: number; winnerId: number; loserId: number; result: 'played' | 'forfeit' }
    | { type: 'reopened'; matchId: number; previousWinnerId: number }
    | { type: 'cancelled'; matchId: number; reason: 'admin' | 'declined' }
    | { type: 'players-changed'; matchId: number; before: [number | null, number | null]; after: [number | null, number | null] }
    | { type: 'reset'; matchId: number; previousWinnerId: number | null };

/**
 * Runs inside the transaction of the match change, after the match rows are written. Betting
 * hooks settlement and refunds in here. If it throws, the whole change is rolled back.
 */
export async function handleMatchEvents(client: PoolClient, events: readonly MatchEvent[]): Promise<void> {
    void client;
    void events;
}
