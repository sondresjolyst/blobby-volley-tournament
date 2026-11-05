import { describe, expect, it } from 'vitest';
import { finalPlacings, FORMATS, generateBracket, placingRules, playersAfter, seededRandom, type Bracket } from './index';

const ids = (n: number) => Array.from({ length: n }, (_, i) => 101 + i);
const COUNTS = Array.from({ length: 31 }, (_, i) => i + 2);

/** Plays every match with seeded random winners. Returns the winners by match id and the loser of a match. */
function playAll(bracket: Bracket, seed: number) {
    const random = seededRandom(seed);
    const winners = new Map<number, number>();
    const played = new Map<number, [number, number]>();
    for (const match of bracket.matches) {
        const [a, b] = playersAfter(bracket, winners).get(match.id)! as [number, number];
        played.set(match.id, [a, b]);
        winners.set(match.id, random() < 0.5 ? a : b);
    }
    const loser = (id: number) => played.get(id)!.find((p) => p !== winners.get(id))!;
    return { winners, loser };
}

describe('third place match', () => {
    it.each(COUNTS.filter((n) => n >= 4))('with %i players is played by the two semifinal losers', (n) => {
        const bracket = FORMATS.single_elimination.build(ids(n), { thirdPlaceMatch: true });
        expect(bracket.matches).toHaveLength(n);
        const final = bracket.matches.find((m) => m.section === 'winners' && !m.winnerTo)!;
        const third = bracket.matches.find((m) => m.section === 'third_place')!;
        expect(third).toMatchObject({ round: 1, position: 1, players: [null, null], winnerTo: null, loserTo: null });
        const semifinals = bracket.matches.filter((m) => m.winnerTo?.matchId === final.id);
        expect(third.id).toBeGreaterThan(Math.max(...semifinals.map((m) => m.id)));
        expect(semifinals.map((m) => m.loserTo)).toEqual([
            { matchId: third.id, slot: 1 },
            { matchId: third.id, slot: 2 },
        ]);
        // Nobody else moves on after a loss.
        expect(bracket.matches.filter((m) => m.loserTo)).toHaveLength(2);
        expect(bracket.rounds.at(-1)).toEqual({ key: 'third_place-1', section: 'third_place', number: 1, name: 'Third place match' });
    });

    it('is off by default', () => {
        expect(FORMATS.single_elimination.build(ids(8)).matches.some((m) => m.section === 'third_place')).toBe(false);
        expect(generateBracket({ format: 'single_elimination', players: ids(8), seeding: { method: 'random', seed: 1 } }).thirdPlaceMatch).toBe(false);
    });

    it('needs 4 players and single elimination', () => {
        expect(() => FORMATS.single_elimination.build(ids(3), { thirdPlaceMatch: true })).toThrow('at least 4');
        expect(() => FORMATS.double_elimination.build(ids(8), { thirdPlaceMatch: true })).toThrow('Only single elimination');
    });

    it('takes its own best-of and rules', () => {
        const plan = generateBracket({
            format: 'single_elimination',
            players: ids(4),
            seeding: { method: 'manual', order: ids(4) },
            thirdPlaceMatch: true,
            rounds: { 'third_place-1': { bestOf: 3, ruleFile: 'bronze.lua' } },
        });
        expect(plan.thirdPlaceMatch).toBe(true);
        expect(plan.matches.at(-1)).toMatchObject({ section: 'third_place', bestOf: 3, ruleFile: 'bronze.lua' });
    });
});

describe('finalPlacings', () => {
    it.each(COUNTS)('double elimination with %i players: grand final winner 1st, its loser 2nd, losers final loser 3rd', (n) => {
        const bracket = FORMATS.double_elimination.build(ids(n));
        for (const seed of [1, 2, 3]) {
            const { winners, loser } = playAll(bracket, seed * 100 + n);
            const final = bracket.matches.at(-1)!;
            const losersFinal = bracket.matches.find((m) => m.section === 'losers' && m.winnerTo?.matchId === final.id);
            const expected = [
                { place: 1, playerId: winners.get(final.id)! },
                { place: 2, playerId: loser(final.id) },
            ];
            if (losersFinal) expected.push({ place: 3, playerId: loser(losersFinal.id) });
            expect(finalPlacings(bracket, winners)).toEqual(expected);
            expect(losersFinal === undefined).toBe(n === 2);
        }
    });

    it.each(COUNTS)('single elimination with %i players: the semifinal losers share 3rd without a third place match', (n) => {
        const bracket = FORMATS.single_elimination.build(ids(n));
        const { winners, loser } = playAll(bracket, n);
        const final = bracket.matches.at(-1)!;
        const semifinals = bracket.matches.filter((m) => m.winnerTo?.matchId === final.id);
        expect(semifinals).toHaveLength(n === 2 ? 0 : n === 3 ? 1 : 2);
        const thirds = semifinals.map((m) => ({ place: 3, playerId: loser(m.id) })).sort((a, b) => a.playerId - b.playerId);
        expect(finalPlacings(bracket, winners)).toEqual([{ place: 1, playerId: winners.get(final.id)! }, { place: 2, playerId: loser(final.id) }, ...thirds]);
    });

    it.each(COUNTS.filter((n) => n >= 4))('single elimination with %i players and a third place match: its winner 3rd, its loser 4th', (n) => {
        const bracket = FORMATS.single_elimination.build(ids(n), { thirdPlaceMatch: true });
        const { winners, loser } = playAll(bracket, n);
        const final = bracket.matches.find((m) => m.section === 'winners' && !m.winnerTo)!;
        const third = bracket.matches.find((m) => m.section === 'third_place')!;
        expect(finalPlacings(bracket, winners)).toEqual([
            { place: 1, playerId: winners.get(final.id)! },
            { place: 2, playerId: loser(final.id) },
            { place: 3, playerId: winners.get(third.id)! },
            { place: 4, playerId: loser(third.id) },
        ]);
    });

    it('gives only the places that are decided', () => {
        const bracket = FORMATS.single_elimination.build([1, 2, 3, 4]);
        // Match 1 is seed 1 against seed 4, match 2 is seed 2 against seed 3.
        expect(finalPlacings(bracket, new Map())).toEqual([]);
        expect(finalPlacings(bracket, new Map([[1, 4]]))).toEqual([{ place: 3, playerId: 1 }]);
        expect(
            finalPlacings(
                bracket,
                new Map([
                    [1, 4],
                    [2, 2],
                    [3, 2],
                ]),
            ),
        ).toEqual([
            { place: 1, playerId: 2 },
            { place: 2, playerId: 4 },
            { place: 3, playerId: 1 },
            { place: 3, playerId: 3 },
        ]);
    });

    it('refuses a winner who is not in the match', () => {
        const bracket = FORMATS.single_elimination.build([1, 2, 3, 4]);
        expect(() => finalPlacings(bracket, new Map([[1, 2]]))).toThrow('not one of its players');
        expect(() => finalPlacings(bracket, new Map([[3, 1]]))).toThrow('not one of its players');
    });

    it('lists the rules for each format', () => {
        expect(placingRules(FORMATS.double_elimination.build([1, 2, 3, 4]))).toEqual([
            { place: 1, matchId: 6, result: 'winner' },
            { place: 2, matchId: 6, result: 'loser' },
            { place: 3, matchId: 5, result: 'loser' },
        ]);
        expect(placingRules(FORMATS.single_elimination.build([1, 2, 3, 4], { thirdPlaceMatch: true }))).toEqual([
            { place: 1, matchId: 3, result: 'winner' },
            { place: 2, matchId: 3, result: 'loser' },
            { place: 3, matchId: 4, result: 'winner' },
            { place: 4, matchId: 4, result: 'loser' },
        ]);
    });
});
