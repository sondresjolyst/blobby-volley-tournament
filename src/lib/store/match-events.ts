import type { PoolClient } from 'pg';
import { refundBets, reverseSettlement, settleBets } from './bet-settlement';

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
 * - reset: an admin sent the match back to upcoming and cleared its games. New bets can be placed
 *   again. previousResult says how the match had ended. For 'played' the settlement is reversed and
 *   the bets are refunded. For 'forfeit' the bets were already refunded at the forfeit, so nothing
 *   more is done. For null the match had not ended, so the open bets are refunded.
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
    | { type: 'reset'; matchId: number; previousWinnerId: number | null; previousResult: 'played' | 'forfeit' | null };

/**
 * Runs inside the transaction of the match change, after the match rows are written. Betting
 * hooks settlement and refunds in here. If it throws, the whole change is rolled back.
 */
export async function handleMatchEvents(client: PoolClient, events: readonly MatchEvent[]): Promise<void> {
    for (const event of events) {
        switch (event.type) {
            case 'started':
                // The match lock already closed bets. Open bets wait for the result.
                break;
            case 'finished':
                if (event.result === 'played') await settleBets(client, event.matchId, event.winnerId);
                else await refundBets(client, event.matchId);
                break;
            case 'reopened':
                await reverseSettlement(client, event.matchId);
                break;
            case 'cancelled':
            case 'players-changed':
                await refundBets(client, event.matchId);
                break;
            case 'reset':
                if (event.previousResult === 'played') await reverseSettlement(client, event.matchId);
                // After a forfeit nothing is open, so this does nothing.
                await refundBets(client, event.matchId);
                break;
        }
    }
}
