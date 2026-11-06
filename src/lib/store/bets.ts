// Placing bets and reading them. Settlement and refunds are in bet-settlement.ts.
import type { Pool } from 'pg';
import { poolOdds, stakeError, type PoolSide } from '@/lib/betting/pool';
import { isOpenForBets, type MatchState } from '@/lib/matches/state';
import { addLedger, creditDaily } from './foza';
import { withMatchForBet } from './matches';
import { inTransaction } from './transaction';

export type BetError =
    /** The match does not exist. */
    | 'not-found'
    /** The match is not open for bets. */
    | 'closed'
    /** The player is not in the active event of the match. */
    | 'event'
    /** The backed player does not play in the match. */
    | 'side'
    /** The player already backs the other side of this match. A bet can be raised but not moved. */
    | 'switch'
    /** The amount is not a whole number of Foza from 1 up. */
    | 'amount'
    /** The amount is more than the balance. */
    | 'balance';

export interface BetInput {
    matchId: number;
    /** The player to back. */
    onPlayerId: number;
    /** The Foza to add to the stake. For a new bet this is the whole stake. */
    amount: number;
}

export type PlaceBetResult = { ok: true; betId: number; stake: number; balance: number; raised: boolean } | { ok: false; error: BetError };

/**
 * Places a bet, or raises the player's bet on the match. The match is locked first through
 * withMatchForBet, so the bet lands before the match starts or is refused after. The player row is
 * locked next, so two bets from the same player at once cannot both spend the same Foza. The daily
 * Foza for today is paid first in the same transaction.
 */
export async function placeBet(pool: Pool, playerId: number, input: BetInput, now: Date): Promise<PlaceBetResult> {
    if (stakeError(input.amount, Number.MAX_SAFE_INTEGER) !== null) return { ok: false, error: 'amount' };
    return inTransaction(pool, async (client): Promise<PlaceBetResult> => {
        const locked = await withMatchForBet(client, input.matchId);
        if (!locked.ok) return locked;
        const match = locked.match;
        if (!match.players.includes(input.onPlayerId)) return { ok: false, error: 'side' };

        const player = await client.query<{ event_id: number; is_active: boolean }>(
            'SELECT p.event_id, e.is_active FROM players p JOIN events e ON e.id = p.event_id WHERE p.id = $1 FOR UPDATE OF p',
            [playerId],
        );
        const row = player.rows[0];
        if (!row || row.event_id !== match.eventId || !row.is_active) return { ok: false, error: 'event' };

        await creditDaily(client, playerId, now);
        const balance = (await client.query<{ foza_balance: number }>('SELECT foza_balance FROM players WHERE id = $1', [playerId])).rows[0].foza_balance;
        const existing = (
            await client.query<{ id: number; on_player_id: number; amount: number }>(`SELECT id, on_player_id, amount FROM bets WHERE match_id = $1 AND player_id = $2 AND status <> 'refunded'`, [
                match.id,
                playerId,
            ])
        ).rows[0];
        if (existing && existing.on_player_id !== input.onPlayerId) return { ok: false, error: 'switch' };
        const error = stakeError(input.amount, balance);
        if (error) return { ok: false, error };

        let betId: number;
        let stake: number;
        if (existing) {
            const { rows } = await client.query<{ amount: number }>('UPDATE bets SET amount = amount + $2, updated_at = now() WHERE id = $1 RETURNING amount', [existing.id, input.amount]);
            betId = existing.id;
            stake = rows[0].amount;
        } else {
            const { rows } = await client.query<{ id: number; amount: number }>('INSERT INTO bets (match_id, player_id, on_player_id, amount) VALUES ($1, $2, $3, $4) RETURNING id, amount', [
                match.id,
                playerId,
                input.onPlayerId,
                input.amount,
            ]);
            betId = rows[0].id;
            stake = rows[0].amount;
        }
        await addLedger(client, [{ playerId, type: 'bet', amount: -input.amount, betId, matchId: match.id }]);
        return { ok: true, betId, stake, balance: balance - input.amount, raised: existing !== undefined };
    });
}

export type BetStatus = 'open' | 'won' | 'lost' | 'returned' | 'refunded';

export interface PlayerBet {
    id: number;
    matchId: number;
    matchState: MatchState;
    onPlayerId: number;
    onNickname: string;
    /** The whole stake, with raises. */
    amount: number;
    status: BetStatus;
    /** What a won bet got from the pool. 0 otherwise. */
    payout: number;
    /** Won or lost on the bet: payout minus stake when won, minus the stake when lost, 0 when the stake came back. Null while open. */
    net: number | null;
    createdAt: Date;
    settledAt: Date | null;
}

function netOf(status: BetStatus, amount: number, payout: number): number | null {
    if (status === 'open') return null;
    if (status === 'won') return payout - amount;
    if (status === 'lost') return -amount;
    return 0;
}

/** Every bet of a player with its result, the newest first. Refunded bets are included. */
export async function listPlayerBets(pool: Pool, playerId: number): Promise<PlayerBet[]> {
    const { rows } = await pool.query<{
        id: number;
        match_id: number;
        state: MatchState;
        on_player_id: number;
        on_nickname: string;
        amount: number;
        status: BetStatus;
        payout: number;
        created_at: Date;
        settled_at: Date | null;
    }>(
        `SELECT b.id, b.match_id, m.state, b.on_player_id, p.nickname AS on_nickname, b.amount, b.status, b.payout, b.created_at, b.settled_at
         FROM bets b JOIN matches m ON m.id = b.match_id JOIN players p ON p.id = b.on_player_id
         WHERE b.player_id = $1 ORDER BY b.id DESC`,
        [playerId],
    );
    return rows.map((r) => ({
        id: r.id,
        matchId: r.match_id,
        matchState: r.state,
        onPlayerId: r.on_player_id,
        onNickname: r.on_nickname,
        amount: r.amount,
        status: r.status,
        payout: r.payout,
        net: netOf(r.status, r.amount, r.payout),
        createdAt: r.created_at,
        settledAt: r.settled_at,
    }));
}

export interface MatchPool {
    matchId: number;
    /** True while bets can be placed. */
    open: boolean;
    /** The Foza in the pool: every bet that is not refunded. */
    total: number;
    /** One for each player, in slot order. Empty while a slot has no player. */
    sides: PoolSide[];
}

interface PoolMatchRecord {
    id: number;
    state: MatchState;
    tournament_id: number | null;
    accepted_at: Date | null;
    player1_id: number | null;
    player2_id: number | null;
}

async function poolsFor(pool: Pool, where: 'id' | 'event_id', value: number): Promise<MatchPool[]> {
    const matches = (await pool.query<PoolMatchRecord>(`SELECT id, state, tournament_id, accepted_at, player1_id, player2_id FROM matches WHERE ${where} = $1 ORDER BY id`, [value])).rows;
    if (matches.length === 0) return [];
    const bets = (
        await pool.query<{ id: number; match_id: number; on_player_id: number; amount: number }>(
            `SELECT id, match_id, on_player_id, amount FROM bets WHERE match_id = ANY($1::int[]) AND status <> 'refunded'`,
            [matches.map((m) => m.id)],
        )
    ).rows;
    return matches.map((m) => {
        const players: [number | null, number | null] = [m.player1_id, m.player2_id];
        const open = isOpenForBets({ state: m.state, tournamentId: m.tournament_id, acceptedAt: m.accepted_at, players });
        const own = bets.filter((b) => b.match_id === m.id).map((b) => ({ id: b.id, onPlayerId: b.on_player_id, amount: b.amount }));
        const total = own.reduce((sum, b) => sum + b.amount, 0);
        if (players[0] === null || players[1] === null) return { matchId: m.id, open, total, sides: [] };
        return { matchId: m.id, open, ...poolOdds(own, [players[0], players[1]]) };
    });
}

/** The pool of a match and the current payout multiplier for each player. Null when there is no such match. */
export async function getMatchPool(pool: Pool, matchId: number): Promise<MatchPool | null> {
    return (await poolsFor(pool, 'id', matchId))[0] ?? null;
}

/** The pool and odds of every match of an event, in match order. */
export async function listMatchPools(pool: Pool, eventId: number): Promise<MatchPool[]> {
    return poolsFor(pool, 'event_id', eventId);
}
