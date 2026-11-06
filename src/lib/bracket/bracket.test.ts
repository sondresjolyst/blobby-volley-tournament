import { describe, expect, it } from 'vitest';
import { seedPositions } from './elimination';
import { DEFAULT_RULES, FORMATS, generateBracket, isFormatId, isRuleFile, seededRandom, seedPlayers, type Bracket, type FormatId } from './index';

const ids = (n: number) => Array.from({ length: n }, (_, i) => 101 + i);
const COUNTS = Array.from({ length: 31 }, (_, i) => i + 2);
const FORMAT_IDS: FormatId[] = ['single_elimination', 'double_elimination'];

/** Plays the bracket in id order. `pick` returns the slot index of the winner. Returns the losses per player and the champion. */
function play(bracket: Bracket, pick: (a: number, b: number) => 0 | 1) {
    const slots = new Map(bracket.matches.map((m) => [m.id, [...m.players]]));
    const losses = new Map<number, number>();
    let champion: number | null = null;
    for (const match of bracket.matches) {
        const [a, b] = slots.get(match.id)!;
        expect(a, `match ${match.id} slot 1`).not.toBeNull();
        expect(b, `match ${match.id} slot 2`).not.toBeNull();
        const w = pick(a!, b!);
        const winner = w === 0 ? a! : b!;
        const loser = w === 0 ? b! : a!;
        losses.set(loser, (losses.get(loser) ?? 0) + 1);
        for (const [player, link] of [
            [winner, match.winnerTo],
            [loser, match.loserTo],
        ] as const) {
            if (!link) continue;
            const target = slots.get(link.matchId)!;
            expect(target[link.slot - 1], `slot ${link.slot} of match ${link.matchId}`).toBeNull();
            target[link.slot - 1] = player;
        }
        if (!match.winnerTo) champion = winner;
    }
    return { losses, champion };
}

describe('seedPositions', () => {
    it('keeps the top seeds apart', () => {
        expect(seedPositions(2)).toEqual([1, 2]);
        expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
        expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });
});

describe.each(FORMAT_IDS)('%s', (format) => {
    const double = format === 'double_elimination';

    it.each(COUNTS)('gives a valid bracket for %i players', (n) => {
        const seeds = ids(n);
        const bracket = FORMATS[format].build(seeds);
        const size = 2 ** Math.ceil(Math.log2(n));
        const byes = size - n;

        // Single elimination has n - 1 matches. Double has n - 1 in the winners bracket,
        // n - 2 in the losers bracket and the grand final, so 2n - 2.
        expect(bracket.matches).toHaveLength(double ? 2 * n - 2 : n - 1);

        // Every player is placed once. Players with a bye skip round one and are the top seeds.
        const placed = bracket.matches.flatMap((m) => m.players.filter((p): p is number => p !== null));
        expect([...placed].sort((a, b) => a - b)).toEqual(seeds);
        const firstRound = bracket.matches.filter((m) => m.section === 'winners' && m.round === 1);
        const inFirstRound = new Set(firstRound.flatMap((m) => m.players));
        expect(firstRound.every((m) => m.players[0] !== null && m.players[1] !== null)).toBe(true);
        const withBye = seeds.filter((p) => !inFirstRound.has(p));
        expect(withBye).toEqual(seeds.slice(0, byes));
        for (const p of withBye) {
            expect(bracket.matches.find((m) => m.players.includes(p))).toMatchObject({ section: 'winners', round: 2 });
        }

        // Every match except the final sends its winner on, and only to a later match.
        const finals = bracket.matches.filter((m) => !m.winnerTo);
        expect(finals).toHaveLength(1);
        expect(finals[0]).toBe(bracket.matches.at(-1));
        expect(finals[0].section).toBe(double ? 'final' : 'winners');
        for (const m of bracket.matches) {
            if (m.winnerTo) expect(m.winnerTo.matchId).toBeGreaterThan(m.id);
            if (m.loserTo) expect(m.loserTo.matchId).toBeGreaterThan(m.id);
            // A loser moves on only from the winners bracket of a double elimination.
            expect(m.loserTo !== null).toBe(double && m.section === 'winners');
        }

        // Each empty slot is filled by exactly one link.
        const links = bracket.matches.flatMap((m) => [m.winnerTo, m.loserTo]).filter((l) => l !== null);
        const keys = links.map((l) => `${l.matchId}:${l.slot}`);
        expect(new Set(keys).size).toBe(keys.length);
        const empty = bracket.matches.flatMap((m) => m.players.flatMap((p, s) => (p === null ? [`${m.id}:${s + 1}`] : [])));
        expect([...keys].sort()).toEqual([...empty].sort());

        // Rounds are numbered from 1 in each section with no gaps, and positions from 1 in each round.
        for (const round of bracket.rounds) {
            const inRound = bracket.matches.filter((m) => m.section === round.section && m.round === round.number);
            expect(inRound.map((m) => m.position)).toEqual(inRound.map((_, i) => i + 1));
        }
        expect(bracket.rounds.filter((r) => r.section === 'winners')).toHaveLength(Math.ceil(Math.log2(n)));
        expect(new Set(bracket.matches.map((m) => `${m.section}-${m.round}`))).toEqual(new Set(bracket.rounds.map((r) => r.key)));
    });

    it.each(COUNTS)('can be played to the end with %i players', (n) => {
        const bracket = FORMATS[format].build(ids(n));
        const random = seededRandom(n);
        for (const pick of [() => 0 as const, () => 1 as const, () => (random() < 0.5 ? 0 : 1)]) {
            const { losses, champion } = play(bracket, pick);
            expect(champion).not.toBeNull();
            const out = ids(n).filter((p) => p !== champion);
            // Everyone else is knocked out. In double elimination only the grand final loser may have one loss.
            for (const p of out) expect(losses.get(p)).toBeGreaterThanOrEqual(1);
            const twice = out.filter((p) => losses.get(p) === 2).length;
            if (double) expect(twice).toBeGreaterThanOrEqual(n - 2);
            else expect(twice).toBe(0);
            expect(Math.max(...losses.values())).toBeLessThanOrEqual(double ? 2 : 1);
        }
    });
});

describe('single elimination', () => {
    it('gives the exact bracket for 6 players', () => {
        const bracket = FORMATS.single_elimination.build([1, 2, 3, 4, 5, 6]);
        expect(bracket.rounds.map((r) => r.name)).toEqual(['Round 1', 'Round 2', 'Final']);
        expect(bracket.matches.map((m) => [m.id, m.round, m.position, m.players, m.winnerTo])).toEqual([
            [1, 1, 1, [4, 5], { matchId: 3, slot: 2 }],
            [2, 1, 2, [3, 6], { matchId: 4, slot: 2 }],
            [3, 2, 1, [1, null], { matchId: 5, slot: 1 }],
            [4, 2, 2, [2, null], { matchId: 5, slot: 2 }],
            [5, 3, 1, [null, null], null],
        ]);
    });
});

describe('double elimination', () => {
    it('gives the exact bracket for 4 players with one grand final and no reset', () => {
        const bracket = FORMATS.double_elimination.build([1, 2, 3, 4]);
        expect(bracket.rounds.map((r) => r.name)).toEqual(['Winners round 1', 'Winners round 2', 'Losers round 1', 'Losers round 2', 'Grand final']);
        expect(bracket.matches.map((m) => [m.id, m.section, m.round, m.players, m.winnerTo, m.loserTo])).toEqual([
            [1, 'winners', 1, [1, 4], { matchId: 3, slot: 1 }, { matchId: 4, slot: 1 }],
            [2, 'winners', 1, [2, 3], { matchId: 3, slot: 2 }, { matchId: 4, slot: 2 }],
            [3, 'winners', 2, [null, null], { matchId: 6, slot: 1 }, { matchId: 5, slot: 2 }],
            [4, 'losers', 1, [null, null], { matchId: 5, slot: 1 }, null],
            [5, 'losers', 2, [null, null], { matchId: 6, slot: 2 }, null],
            [6, 'final', 1, [null, null], null, null],
        ]);
    });

    it('sends the loser of a 2 player match straight to the grand final', () => {
        const bracket = FORMATS.double_elimination.build([7, 9]);
        expect(bracket.matches).toEqual([
            { id: 1, section: 'winners', round: 1, position: 1, players: [7, 9], winnerTo: { matchId: 2, slot: 1 }, loserTo: { matchId: 2, slot: 2 } },
            { id: 2, section: 'final', round: 1, position: 1, players: [null, null], winnerTo: null, loserTo: null },
        ]);
    });
});

describe('build', () => {
    it.each(FORMAT_IDS)('%s refuses too few, too many or repeated players', (format) => {
        expect(() => FORMATS[format].build([1])).toThrow();
        expect(() => FORMATS[format].build(ids(33))).toThrow();
        expect(() => FORMATS[format].build([1, 2, 2])).toThrow();
    });

    it('knows its formats', () => {
        expect(isFormatId('single_elimination')).toBe(true);
        expect(isFormatId('double_elimination')).toBe(true);
        expect(isFormatId('round_robin')).toBe(false);
        expect(isFormatId('toString')).toBe(false);
    });
});

describe('seedPlayers', () => {
    it('gives the same order for the same random seed and any input order', () => {
        const players = ids(12);
        const a = seedPlayers(players, { method: 'random', seed: 42 });
        expect(seedPlayers([...players].reverse(), { method: 'random', seed: 42 })).toEqual(a);
        expect([...a].sort((x, y) => x - y)).toEqual(players);
        expect(seedPlayers(players, { method: 'random', seed: 43 })).not.toEqual(a);
    });

    it('gives an exact order for a known seed', () => {
        expect(seedPlayers([1, 2, 3, 4, 5, 6, 7, 8], { method: 'random', seed: 1 })).toEqual([3, 2, 7, 8, 5, 4, 1, 6]);
    });

    it('refuses a random seed out of range', () => {
        expect(() => seedPlayers([1, 2], { method: 'random', seed: -1 })).toThrow();
        expect(() => seedPlayers([1, 2], { method: 'random', seed: 2 ** 31 })).toThrow();
        expect(() => seedPlayers([1, 2], { method: 'random', seed: 1.5 })).toThrow();
    });

    it('keeps the hand seeding order', () => {
        expect(seedPlayers([1, 2, 3, 4], { method: 'manual', order: [3, 1, 4, 2] })).toEqual([3, 1, 4, 2]);
    });

    it('refuses a hand seeding that does not match the players', () => {
        expect(() => seedPlayers([1, 2, 3], { method: 'manual', order: [1, 2] })).toThrow();
        expect(() => seedPlayers([1, 2, 3], { method: 'manual', order: [1, 2, 2] })).toThrow();
        expect(() => seedPlayers([1, 2, 3], { method: 'manual', order: [1, 2, 4] })).toThrow();
        expect(() => seedPlayers([1, 2, 3], { method: 'manual', order: [1, 2, 3, 4] })).toThrow();
    });

    it('seeds by Elo with 1000 for players without a rating and the lower id first on a tie', () => {
        const ratings = new Map([
            [1, 900],
            [2, 1200],
            [4, 1000],
            [5, 1100],
        ]);
        expect(seedPlayers([1, 2, 3, 4, 5], { method: 'elo', ratings })).toEqual([2, 5, 3, 4, 1]);
        expect(seedPlayers([5, 4, 3, 2, 1], { method: 'elo', ratings: new Map() })).toEqual([1, 2, 3, 4, 5]);
    });
});

describe('generateBracket', () => {
    it('gives the same bracket for the same random seed', () => {
        const request = { format: 'double_elimination' as const, players: ids(11), seeding: { method: 'random' as const, seed: 2026 } };
        const a = generateBracket(request);
        expect(generateBracket({ ...request, players: [...request.players].reverse() })).toEqual(a);
        expect(generateBracket({ ...request, seeding: { method: 'random', seed: 2027 } })).not.toEqual(a);
    });

    it('places the hand seeding so seed 1 gets the bye', () => {
        const plan = generateBracket({ format: 'single_elimination', players: [10, 20, 30], seeding: { method: 'manual', order: [30, 10, 20] } });
        expect(plan.seeds).toEqual([30, 10, 20]);
        expect(plan.matches.map((m) => m.players)).toEqual([
            [10, 20],
            [30, null],
        ]);
    });

    it('places the Elo order so the best rated player gets the bye', () => {
        const plan = generateBracket({ format: 'single_elimination', players: [10, 20, 30], seeding: { method: 'elo', ratings: new Map([[20, 1500]]) } });
        expect(plan.seeds).toEqual([20, 10, 30]);
        expect(plan.matches[1].players).toEqual([20, null]);
    });

    it('puts the best-of and rules of each round on its matches, with best of 1 and default rules otherwise', () => {
        const plan = generateBracket({
            format: 'single_elimination',
            players: ids(4),
            seeding: { method: 'manual', order: ids(4) },
            rounds: { 'winners-2': { bestOf: 5, ruleFile: 'fast_ball.lua' } },
        });
        expect(plan.rounds.map((r) => [r.key, r.bestOf, r.ruleFile])).toEqual([
            ['winners-1', 1, DEFAULT_RULES],
            ['winners-2', 5, 'fast_ball.lua'],
        ]);
        expect(plan.matches.map((m) => [m.bestOf, m.ruleFile])).toEqual([
            [1, 'default.lua'],
            [1, 'default.lua'],
            [5, 'fast_ball.lua'],
        ]);
    });

    it('refuses a best-of or rule file that is not allowed', () => {
        const base = { format: 'single_elimination' as const, players: ids(2), seeding: { method: 'random' as const, seed: 1 } };
        expect(() => generateBracket({ ...base, rounds: { 'winners-1': { bestOf: 2 as never } } })).toThrow();
        expect(() => generateBracket({ ...base, rounds: { 'winners-1': { ruleFile: '../x.lua' } } })).toThrow();
    });

    it('accepts only plain .lua file names as rules', () => {
        expect(isRuleFile('default.lua')).toBe(true);
        expect(isRuleFile('Fast-Ball_2.lua')).toBe(true);
        for (const bad of ['', 'default', '.lua', '../default.lua', 'a/b.lua', 'a b.lua', 'x.lua.txt', `${'a'.repeat(61)}.lua`]) expect(isRuleFile(bad)).toBe(false);
    });
});
