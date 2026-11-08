// Betting stats from settled bets. Open and refunded bets are left out. A returned stake means
// nobody backed the winner, so the bet backed the loser and counts as wrong.

export interface SettledBet {
    betId: number;
    matchId: number;
    bettorId: number;
    onPlayerId: number;
    amount: number;
    status: 'won' | 'lost' | 'returned';
    /** What a won bet got from the pool. 0 otherwise. */
    payout: number;
}

export interface BetHighlight {
    matchId: number;
    onPlayerId: number;
    /** For the biggest win, the Foza won on top of the stake. For the best odds, payout divided by stake. */
    value: number;
}

export interface BettorStats {
    playerId: number;
    /** Settled bets. */
    bets: number;
    /** Bets on the winner. */
    correct: number;
    /** Correct bets as a share of settled bets, from 0 to 1. */
    hitRate: number;
    /** Foza won on top of the stakes of won bets. */
    fozaWon: number;
    /** Stakes of lost bets. */
    fozaLost: number;
    /** Foza won minus Foza lost. */
    net: number;
    biggestWin: BetHighlight | null;
    bestOdds: BetHighlight | null;
}

const better = (current: BetHighlight | null, next: BetHighlight) => (current === null || next.value > current.value ? next : current);

/** Stats for every bettor with a settled bet. The bets should be in the order they were placed. */
export function bettorStats(bets: readonly SettledBet[]): Map<number, BettorStats> {
    const all = new Map<number, BettorStats>();
    for (const bet of bets) {
        let s = all.get(bet.bettorId);
        if (!s) {
            s = { playerId: bet.bettorId, bets: 0, correct: 0, hitRate: 0, fozaWon: 0, fozaLost: 0, net: 0, biggestWin: null, bestOdds: null };
            all.set(bet.bettorId, s);
        }
        s.bets++;
        if (bet.status === 'won') {
            const profit = bet.payout - bet.amount;
            s.correct++;
            s.fozaWon += profit;
            s.biggestWin = better(s.biggestWin, { matchId: bet.matchId, onPlayerId: bet.onPlayerId, value: profit });
            s.bestOdds = better(s.bestOdds, { matchId: bet.matchId, onPlayerId: bet.onPlayerId, value: bet.payout / bet.amount });
        } else if (bet.status === 'lost') {
            s.fozaLost += bet.amount;
        }
        s.hitRate = s.correct / s.bets;
        s.net = s.fozaWon - s.fozaLost;
    }
    return all;
}

/** The most Foza won net first, then the most correct bets. The Foza boards rank by this. */
export function compareNet(a: BettorStats, b: BettorStats): number {
    return b.net - a.net || compareCorrect(a, b);
}

/** Most correct bets first, then the best hit rate, then the most Foza won net. */
export function compareCorrect(a: BettorStats, b: BettorStats): number {
    return b.correct - a.correct || b.hitRate - a.hitRate || b.net - a.net;
}
