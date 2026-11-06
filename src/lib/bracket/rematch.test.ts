import { describe, expect, it } from 'vitest';
import { dropOrder } from './elimination';
import { FORMATS, seededRandom, type Bracket, type BracketMatch } from './index';

const ids = (n: number) => Array.from({ length: n }, (_, i) => 101 + i);
const COUNTS = Array.from({ length: 31 }, (_, i) => i + 2);

/** Every match slot a player in `start` can reach by any results. */
function reach(bracket: Bracket, start: BracketMatch['winnerTo']): Set<string> {
    const byId = new Map(bracket.matches.map((m) => [m.id, m]));
    const seen = new Set<string>();
    const todo = start ? [start] : [];
    while (todo.length) {
        const link = todo.pop()!;
        const key = `${link.matchId}:${link.slot}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const match = byId.get(link.matchId)!;
        if (match.winnerTo) todo.push(match.winnerTo);
        if (match.loserTo) todo.push(match.loserTo);
    }
    return seen;
}

/**
 * Every pair of matches where two players who meet in the first can meet again in the second.
 * That happens exactly when the winner of the first can reach one slot of the second and the
 * loser the other slot. The two paths cannot share a match without the players meeting there, so
 * this covers every possible result path, not a sample.
 */
function rematchSpots(bracket: Bracket): [BracketMatch, BracketMatch][] {
    const spots: [BracketMatch, BracketMatch][] = [];
    for (const first of bracket.matches) {
        const won = reach(bracket, first.winnerTo);
        const lost = reach(bracket, first.loserTo);
        for (const second of bracket.matches) {
            if ((won.has(`${second.id}:1`) && lost.has(`${second.id}:2`)) || (won.has(`${second.id}:2`) && lost.has(`${second.id}:1`))) spots.push([first, second]);
        }
    }
    return spots;
}

const losersRounds = (bracket: Bracket) => bracket.rounds.filter((r) => r.section === 'losers').length;
/** Spots in the losers bracket before the losers final. Rematches in the losers final or the grand final are allowed. */
const early = (bracket: Bracket) => rematchSpots(bracket).filter(([, second]) => second.section === 'losers' && second.round < losersRounds(bracket));

describe('double elimination rematches', () => {
    it.each(COUNTS)('with %i players a rematch can only come late in the losers bracket', (n) => {
        const bracket = FORMATS.double_elimination.build(ids(n));
        const winnersRounds = bracket.rounds.filter((r) => r.section === 'winners').length;
        // No pair can meet twice in the winners bracket.
        expect(rematchSpots(bracket).filter(([, second]) => second.section === 'winners')).toEqual([]);
        // With 2 to 4 players nobody meets twice before the losers final. From 5 players on it
        // cannot be avoided by any drop order, as an exhaustive search over orders shows. The
        // earliest it can happen is R - 2 rounds before the losers final, R being the winners rounds.
        for (const [, second] of early(bracket)) expect(losersRounds(bracket) - second.round).toBeLessThanOrEqual(Math.max(winnersRounds - 2, 0));
        if (n <= 4) expect(early(bracket)).toEqual([]);
        // As few places for an early rematch as the best order the search found: n - 4 up to 16 players, n + 4 above.
        expect(early(bracket)).toHaveLength(n < 5 ? 0 : n <= 16 ? n - 4 : n + 4);
    });

    it.each(COUNTS)('with %i players a large seeded sample of played brackets has rematches only where the analysis allows them', (n) => {
        const bracket = FORMATS.double_elimination.build(ids(n));
        const allowed = new Set(rematchSpots(bracket).map(([a, b]) => `${a.id}>${b.id}`));
        const random = seededRandom(1000 + n);
        for (let run = 0; run < 300; run++) {
            const slots = new Map(bracket.matches.map((m) => [m.id, [...m.players]]));
            const met = new Map<string, number>();
            for (const match of bracket.matches) {
                const [a, b] = slots.get(match.id)! as [number, number];
                const key = [a, b].sort().join('-');
                const before = met.get(key);
                if (before !== undefined) expect(allowed.has(`${before}>${match.id}`), `${key} in match ${match.id}`).toBe(true);
                met.set(key, match.id);
                const [winner, loser] = random() < 0.5 ? [a, b] : [b, a];
                if (match.winnerTo) slots.get(match.winnerTo.matchId)![match.winnerTo.slot - 1] = winner;
                if (match.loserTo) slots.get(match.loserTo.matchId)![match.loserTo.slot - 1] = loser;
            }
        }
    });
});

describe('dropOrder', () => {
    it('reverses the first drop, swaps the halves of the next and keeps alternating', () => {
        expect(dropOrder([0, 1, 2, 3, 4, 5, 6, 7], 1)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
        expect(dropOrder([0, 1, 2, 3], 2)).toEqual([2, 3, 0, 1]);
        expect(dropOrder([0, 1], 3)).toEqual([1, 0]);
        expect(dropOrder([0], 4)).toEqual([0]);
    });
});
