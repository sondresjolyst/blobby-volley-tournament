// Parimutuel pool maths. No database access, so it can be tested on its own.

export interface PoolBet {
    id: number;
    /** The player the bet backs. */
    onPlayerId: number;
    amount: number;
}

export type BetOutcome =
    /** The bet backed the winner and gets its share of the pool. */
    | { id: number; status: 'won'; payout: number }
    | { id: number; status: 'lost'; payout: 0 }
    /** Nobody backed the winner, so every stake comes back. */
    | { id: number; status: 'returned'; payout: number };

const total = (bets: readonly PoolBet[]) => bets.reduce((sum, bet) => sum + bet.amount, 0);

/**
 * Settles a pool on the winner of the match. Bettors on the winner share the whole pool in
 * proportion to their stake. Each payout rounds down to whole Foza, and what is left over is
 * discarded. When nobody backed the winner, every stake is returned.
 */
export function settlePool(bets: readonly PoolBet[], winnerId: number): BetOutcome[] {
    const pool = BigInt(total(bets));
    const winning = BigInt(total(bets.filter((bet) => bet.onPlayerId === winnerId)));
    if (winning === BigInt(0)) return bets.map((bet) => ({ id: bet.id, status: 'returned', payout: bet.amount }));
    return bets.map((bet) =>
        bet.onPlayerId === winnerId ? { id: bet.id, status: 'won', payout: Number((BigInt(bet.amount) * pool) / winning) } : { id: bet.id, status: 'lost', payout: 0 },
    );
}

export interface PoolSide {
    playerId: number;
    /** The Foza staked on this player. */
    stake: number;
    bettors: number;
    /**
     * What one Foza on this player pays back if the player wins, before rounding down. Null while
     * nobody backs the player.
     */
    multiplier: number | null;
}

export interface PoolOdds {
    total: number;
    sides: [PoolSide, PoolSide];
}

/** The size of the pool and the current payout multiplier for each player of the match. */
export function poolOdds(bets: readonly PoolBet[], players: readonly [number, number]): PoolOdds {
    const sum = total(bets);
    const side = (playerId: number): PoolSide => {
        const backing = bets.filter((bet) => bet.onPlayerId === playerId);
        const stake = total(backing);
        return { playerId, stake, bettors: backing.length, multiplier: stake === 0 ? null : sum / stake };
    };
    return { total: sum, sides: [side(players[0]), side(players[1])] };
}

/** The most Foza one bet or raise can stake. It keeps amounts far inside a database integer. */
export const MAX_STAKE = 1_000_000;

/**
 * Why a stake cannot be placed from this balance, or null when it can. A stake is whole Foza, at
 * least 1, and never more than the balance. The whole balance is allowed.
 */
export function stakeError(amount: number, balance: number): 'amount' | 'balance' | null {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_STAKE) return 'amount';
    return amount > balance ? 'balance' : null;
}
