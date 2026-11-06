// Settles and refunds bets inside the transaction of a match change. handleMatchEvents calls it
// while the change holds the match lock, so no bet can be placed on the match at the same time.
import type { PoolClient } from 'pg';
import { settlePool } from '@/lib/betting/pool';
import { addLedger, type LedgerEntry } from './foza';

interface BetRecord {
    id: number;
    player_id: number;
    on_player_id: number;
    amount: number;
    status: 'open' | 'won' | 'lost' | 'returned';
    payout: number;
}

/** The live bets of a match in one of the states, locked, in player order. */
async function betsIn(client: PoolClient, matchId: number, statuses: readonly BetRecord['status'][]): Promise<BetRecord[]> {
    const { rows } = await client.query<BetRecord>(
        'SELECT id, player_id, on_player_id, amount, status, payout FROM bets WHERE match_id = $1 AND status = ANY($2::text[]) ORDER BY player_id FOR UPDATE',
        [matchId, statuses],
    );
    return rows;
}

async function setStatus(client: PoolClient, updates: { id: number; status: string; payout: number }[]) {
    if (updates.length === 0) return;
    await client.query(
        `UPDATE bets b SET status = u.status, payout = u.payout, updated_at = now(),
             settled_at = CASE WHEN u.status = 'open' THEN NULL ELSE now() END
         FROM unnest($1::int[], $2::text[], $3::int[]) AS u (id, status, payout) WHERE b.id = u.id`,
        [updates.map((u) => u.id), updates.map((u) => u.status), updates.map((u) => u.payout)],
    );
}

/** Pays the open bets of a decided match from its pool. */
export async function settleBets(client: PoolClient, matchId: number, winnerId: number): Promise<void> {
    const bets = await betsIn(client, matchId, ['open']);
    if (bets.length === 0) return;
    const outcomes = settlePool(
        bets.map((b) => ({ id: b.id, onPlayerId: b.on_player_id, amount: b.amount })),
        winnerId,
    );
    const owner = new Map(bets.map((b) => [b.id, b.player_id]));
    // A returned stake is a refund in the ledger. Only a won bet keeps a payout on the bet.
    await setStatus(
        client,
        outcomes.map((o) => ({ id: o.id, status: o.status, payout: o.status === 'won' ? o.payout : 0 })),
    );
    const entries: LedgerEntry[] = outcomes
        .filter((o) => o.status !== 'lost')
        .map((o) => ({ playerId: owner.get(o.id)!, type: o.status === 'won' ? 'payout' : 'refund', amount: o.payout, betId: o.id, matchId }));
    await addLedger(client, entries);
}

/** Gives back the stake of every open bet on the match. */
export async function refundBets(client: PoolClient, matchId: number): Promise<void> {
    const bets = await betsIn(client, matchId, ['open']);
    await setStatus(
        client,
        bets.map((b) => ({ id: b.id, status: 'refunded', payout: 0 })),
    );
    await addLedger(
        client,
        bets.map((b) => ({ playerId: b.player_id, type: 'refund', amount: b.amount, betId: b.id, matchId })),
    );
}

/**
 * Takes back the settlement of a match. Payouts and returned stakes are taken back from the
 * bettors, even when that takes a balance below 0, and the bets are open again.
 */
export async function reverseSettlement(client: PoolClient, matchId: number): Promise<void> {
    const bets = await betsIn(client, matchId, ['won', 'lost', 'returned']);
    await setStatus(
        client,
        bets.map((b) => ({ id: b.id, status: 'open', payout: 0 })),
    );
    await addLedger(
        client,
        bets
            .filter((b) => b.status !== 'lost')
            .map((b) => ({ playerId: b.player_id, type: 'reversal', amount: -(b.status === 'won' ? b.payout : b.amount), betId: b.id, matchId })),
    );
}
