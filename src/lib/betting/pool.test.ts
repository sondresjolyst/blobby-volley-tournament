import { describe, expect, it } from 'vitest';
import { poolOdds, settlePool, stakeError, type PoolBet } from './pool';

const A = 1;
const B = 2;
const bet = (id: number, onPlayerId: number, amount: number): PoolBet => ({ id, onPlayerId, amount });

describe('settlePool', () => {
    it('shares the whole pool between bettors on the winner in proportion to their stake', () => {
        const bets = [bet(1, A, 100), bet(2, A, 300), bet(3, B, 400)];
        expect(settlePool(bets, A)).toEqual([
            { id: 1, status: 'won', payout: 200 },
            { id: 2, status: 'won', payout: 600 },
            { id: 3, status: 'lost', payout: 0 },
        ]);
    });

    it('rounds each payout down and discards the leftover', () => {
        // Pool 10, winners staked 3 in total. 1 * 10 / 3 = 3.33 and 2 * 10 / 3 = 6.67.
        const bets = [bet(1, A, 1), bet(2, A, 2), bet(3, B, 7)];
        const outcomes = settlePool(bets, A);
        expect(outcomes).toEqual([
            { id: 1, status: 'won', payout: 3 },
            { id: 2, status: 'won', payout: 6 },
            { id: 3, status: 'lost', payout: 0 },
        ]);
        const paid = outcomes.reduce((sum, o) => sum + o.payout, 0);
        expect(paid).toBe(9);
    });

    it('never pays out more than the pool, even with large stakes', () => {
        const bets = [bet(1, A, 999_999), bet(2, A, 333_333), bet(3, A, 1), bet(4, B, 1_000_000), bet(5, B, 777_777)];
        const paid = settlePool(bets, A).reduce((sum, o) => sum + o.payout, 0);
        const total = bets.reduce((sum, b) => sum + b.amount, 0);
        expect(paid).toBeLessThanOrEqual(total);
        expect(total - paid).toBeLessThan(3);
    });

    it('returns every stake when nobody bet on the winner', () => {
        const bets = [bet(1, A, 50), bet(2, A, 25)];
        expect(settlePool(bets, B)).toEqual([
            { id: 1, status: 'returned', payout: 50 },
            { id: 2, status: 'returned', payout: 25 },
        ]);
    });

    it('pays back exactly the stakes when everyone backed the winner', () => {
        const bets = [bet(1, B, 70), bet(2, B, 30)];
        expect(settlePool(bets, B)).toEqual([
            { id: 1, status: 'won', payout: 70 },
            { id: 2, status: 'won', payout: 30 },
        ]);
    });

    it('settles an empty pool to nothing', () => {
        expect(settlePool([], A)).toEqual([]);
    });
});

describe('poolOdds', () => {
    it('gives the pool size and the payout multiplier per side', () => {
        expect(poolOdds([bet(1, A, 100), bet(2, A, 100), bet(3, B, 600)], [A, B])).toEqual({
            total: 800,
            sides: [
                { playerId: A, stake: 200, bettors: 2, multiplier: 4 },
                { playerId: B, stake: 600, bettors: 1, multiplier: 800 / 600 },
            ],
        });
    });

    it('has no multiplier for a side nobody backs, and 1 for a one-sided pool', () => {
        expect(poolOdds([bet(1, A, 40)], [A, B])).toEqual({
            total: 40,
            sides: [
                { playerId: A, stake: 40, bettors: 1, multiplier: 1 },
                { playerId: B, stake: 0, bettors: 0, multiplier: null },
            ],
        });
        expect(poolOdds([], [A, B]).total).toBe(0);
    });
});

describe('stakeError', () => {
    it('allows a stake equal to the whole balance and refuses one Foza more', () => {
        expect(stakeError(250, 250)).toBeNull();
        expect(stakeError(251, 250)).toBe('balance');
    });

    it('allows a stake of 1 and refuses 0, negatives and fractions', () => {
        expect(stakeError(1, 1)).toBeNull();
        expect(stakeError(0, 100)).toBe('amount');
        expect(stakeError(-5, 100)).toBe('amount');
        expect(stakeError(1.5, 100)).toBe('amount');
        expect(stakeError(Number.NaN, 100)).toBe('amount');
    });

    it('refuses any stake from an empty balance', () => {
        expect(stakeError(1, 0)).toBe('balance');
    });
});
