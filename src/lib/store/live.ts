// The live stamp of an event. The player pages read it often and load again only when it changes.
import type { Pool } from 'pg';
import { TtlCache } from '@/lib/ttl-cache';

/** How long the open tabs share one stamp read. */
export const LIVE_CACHE_MS = 2_000;

export const liveCache = new TtlCache<string>(LIVE_CACHE_MS);

/**
 * A short text that changes when anything the player pages show changes: a match of the event is
 * added, answered, called, started, scored, ended or filled with a player, a bet or a payout moves
 * Foza, or a player joins. Every bet, payout, refund and daily Foza is a row in foza_ledger, and a
 * lost bet is settled with the end of its match, so the newest ledger row covers the balances and
 * the bets. It is one small query: the matches of one event by their event index, and two newest
 * ids by their primary keys.
 */
export async function liveStamp(pool: Pool, eventId: number): Promise<string> {
    const { rows } = await pool.query<{ stamp: string }>(
        `SELECT concat_ws(':',
            (SELECT md5(coalesce(string_agg(concat_ws(',', id, state, accepted_at IS NOT NULL, player1_id, player2_id, score1, score2, winner_id), ';' ORDER BY id), ''))
             FROM matches WHERE event_id = $1),
            (SELECT coalesce(max(id), 0) FROM foza_ledger),
            (SELECT coalesce(max(id), 0) FROM players)) AS stamp`,
        [eventId],
    );
    return rows[0].stamp;
}
