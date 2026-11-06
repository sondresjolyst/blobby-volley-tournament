import { MAX_PLAYERS, MIN_PLAYERS, type Bracket, type BracketFormat, type BracketMatch, type BracketRound, type BuildOptions, type FormatId, type PlacingRule, type Section } from './types';

// The full bracket is first laid out for the next power of two. Seeds above the player count are
// byes. A match with a bye is then left out and its one player moves on to the next slot.

type Source = { kind: 'bye' } | { kind: 'player'; playerId: number } | { kind: 'result'; match: Slot; result: 'winner' | 'loser' };

interface Slot {
    section: Section;
    level: number;
    index: number;
    sources: [Source, Source];
    played: boolean;
    winner: Source;
    loser: Source;
}

const BYE: Source = { kind: 'bye' };

/**
 * The seed in each first round position for a bracket of `size` players, so seed 1 meets the
 * last seed and the top seeds meet as late as possible. For 8: 1, 8, 4, 5, 2, 7, 3, 6.
 */
export function seedPositions(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const next = order.length * 2 + 1;
        order = order.flatMap((seed) => [seed, next - seed]);
    }
    return order;
}

export function checkSeeds(seeds: readonly number[]): void {
    if (seeds.length < MIN_PLAYERS || seeds.length > MAX_PLAYERS) throw new Error(`A bracket needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
    if (new Set(seeds).size !== seeds.length) throw new Error('A player can only be in a bracket once.');
    if (!seeds.every((id) => Number.isSafeInteger(id))) throw new Error('Player ids must be whole numbers.');
}

/**
 * The order in which the losers of a winners round drop into the losers bracket. The first drop is
 * reversed, the next swaps the two halves, and so on. Of all orders that swap matches by fixed
 * steps this one keeps a rematch latest and rarest, checked by an exhaustive search for 3 to 32
 * players. A rematch before the losers final cannot be avoided for 5 or more players.
 */
export function dropOrder<T>(losers: readonly T[], drop: number): T[] {
    if (losers.length < 2) return [...losers];
    const half = losers.length / 2;
    if (drop % 2 === 1) return [...losers].reverse();
    return [...losers.slice(half), ...losers.slice(0, half)];
}

/** The smallest player count that has two semifinals, so a third place match can be played. */
export const THIRD_PLACE_MIN_PLAYERS = 4;

function layout(seeds: readonly number[], double: boolean, options: BuildOptions = {}): Slot[] {
    checkSeeds(seeds);
    const n = seeds.length;
    const rounds = Math.ceil(Math.log2(n));
    const size = 2 ** rounds;
    const slots: Slot[] = [];

    const add = (section: Section, level: number, index: number, a: Source, b: Source): Slot => {
        const slot: Slot = { section, level, index, sources: [a, b], played: false, winner: BYE, loser: BYE };
        if (a.kind !== 'bye' && b.kind !== 'bye') {
            slot.played = true;
            slot.winner = { kind: 'result', match: slot, result: 'winner' };
            slot.loser = { kind: 'result', match: slot, result: 'loser' };
        } else {
            // A bye moves the other player on without a match.
            slot.winner = a.kind === 'bye' ? b : a;
        }
        slots.push(slot);
        return slot;
    };

    const positions = seedPositions(size);
    const seedSource = (seed: number): Source => (seed <= n ? { kind: 'player', playerId: seeds[seed - 1] } : BYE);
    const winners: Slot[][] = [];
    for (let level = 1; level <= rounds; level++) {
        const count = size / 2 ** level;
        const previous = winners[level - 2];
        const round: Slot[] = [];
        for (let i = 0; i < count; i++) {
            const a = level === 1 ? seedSource(positions[2 * i]) : previous[2 * i].winner;
            const b = level === 1 ? seedSource(positions[2 * i + 1]) : previous[2 * i + 1].winner;
            round.push(add('winners', level, i, a, b));
        }
        winners.push(round);
    }
    if (!double) {
        if (options.thirdPlaceMatch) {
            if (n < THIRD_PLACE_MIN_PLAYERS) throw new Error(`A third place match needs at least ${THIRD_PLACE_MIN_PLAYERS} players.`);
            const semifinals = winners[rounds - 2];
            add('third_place', 1, 0, semifinals[0].loser, semifinals[1].loser);
        }
        return slots;
    }
    if (options.thirdPlaceMatch) throw new Error('Only single elimination has a third place match.');

    const winnersChampion = winners[rounds - 1][0].winner;
    let losersChampion: Source;
    if (rounds === 1) {
        losersChampion = winners[0][0].loser;
    } else {
        // Losers round 1: the losers of winners round 1 play each other.
        let level = 1;
        let current: Slot[] = [];
        for (let i = 0; i < size / 4; i++) current.push(add('losers', level, i, winners[0][2 * i].loser, winners[0][2 * i + 1].loser));
        for (let k = 1; k < rounds; k++) {
            // The losers of the next winners round drop in, in an order that keeps rematches late.
            const drop = dropOrder(
                winners[k].map((slot) => slot.loser),
                k,
            );
            level++;
            const survivors = current;
            current = survivors.map((slot, i) => add('losers', level, i, slot.winner, drop[i]));
            if (k < rounds - 1) {
                level++;
                const paired = current;
                current = [];
                for (let i = 0; i < paired.length / 2; i++) current.push(add('losers', level, i, paired[2 * i].winner, paired[2 * i + 1].winner));
            }
        }
        losersChampion = current[0].winner;
    }
    add('final', 1, 0, winnersChampion, losersChampion);
    return slots;
}

const SECTIONS: Section[] = ['winners', 'losers', 'third_place', 'final'];

export function roundName(format: FormatId, section: Section, number: number, last: number): string {
    if (section === 'final') return 'Grand final';
    if (section === 'third_place') return 'Third place match';
    if (format === 'single_elimination') return number === last ? 'Final' : `Round ${number}`;
    return `${section === 'winners' ? 'Winners' : 'Losers'} round ${number}`;
}

/** Turns the layout into numbered rounds and matches. Rounds with no match left are dropped. */
function finish(format: FormatId, slots: Slot[]): Bracket {
    const rounds: BracketRound[] = [];
    const matches: BracketMatch[] = [];
    const idOf = new Map<Slot, number>();
    for (const section of SECTIONS) {
        const played = slots.filter((slot) => slot.played && slot.section === section);
        const levels = [...new Set(played.map((slot) => slot.level))].sort((a, b) => a - b);
        levels.forEach((level, i) => {
            const number = i + 1;
            rounds.push({ key: `${section}-${number}`, section, number, name: roundName(format, section, number, levels.length) });
            const inRound = played.filter((slot) => slot.level === level).sort((a, b) => a.index - b.index);
            inRound.forEach((slot, p) => {
                const id = matches.length + 1;
                idOf.set(slot, id);
                matches.push({ id, section, round: number, position: p + 1, players: [null, null], winnerTo: null, loserTo: null });
            });
        });
    }
    for (const slot of slots) {
        const id = idOf.get(slot);
        if (id === undefined) continue;
        const match = matches[id - 1];
        slot.sources.forEach((source, s) => {
            const link = { matchId: id, slot: (s + 1) as 1 | 2 };
            if (source.kind === 'player') match.players[s] = source.playerId;
            else if (source.kind === 'result') {
                const from = matches[idOf.get(source.match)! - 1];
                if (source.result === 'winner') from.winnerTo = link;
                else from.loserTo = link;
            }
        });
    }
    return { format, rounds, matches };
}

const feeders = (bracket: Bracket, target: BracketMatch) => bracket.matches.filter((m) => m.winnerTo?.matchId === target.id);

/**
 * 1st is the final winner and 2nd the final loser. With a third place match its winner is 3rd and
 * its loser 4th. Without one, the semifinal losers share 3rd.
 */
function singlePlacingRules(bracket: Bracket): PlacingRule[] {
    const final = bracket.matches.find((m) => m.section === 'winners' && !m.winnerTo)!;
    const rules: PlacingRule[] = [
        { place: 1, matchId: final.id, result: 'winner' },
        { place: 2, matchId: final.id, result: 'loser' },
    ];
    const third = bracket.matches.find((m) => m.section === 'third_place');
    if (third) {
        rules.push({ place: 3, matchId: third.id, result: 'winner' }, { place: 4, matchId: third.id, result: 'loser' });
    } else {
        for (const semifinal of feeders(bracket, final)) rules.push({ place: 3, matchId: semifinal.id, result: 'loser' });
    }
    return rules;
}

/** 1st is the grand final winner, 2nd the grand final loser and 3rd the loser of the losers final. */
function doublePlacingRules(bracket: Bracket): PlacingRule[] {
    const final = bracket.matches.find((m) => m.section === 'final')!;
    const rules: PlacingRule[] = [
        { place: 1, matchId: final.id, result: 'winner' },
        { place: 2, matchId: final.id, result: 'loser' },
    ];
    // With 2 players the loser of the only match goes straight to the grand final, so there is no 3rd.
    const losersFinal = feeders(bracket, final).find((m) => m.section === 'losers');
    if (losersFinal) rules.push({ place: 3, matchId: losersFinal.id, result: 'loser' });
    return rules;
}

/** Single elimination. An optional third place match is played by the two semifinal losers. */
export const singleElimination: BracketFormat = {
    id: 'single_elimination',
    name: 'Single elimination',
    build: (seeds, options) => finish('single_elimination', layout(seeds, false, options)),
    placingRules: singlePlacingRules,
};

/**
 * Double elimination. A player who loses in the winners bracket drops to the losers bracket. The
 * winners bracket champion meets the losers bracket champion once in the grand final. There is no
 * reset match.
 */
export const doubleElimination: BracketFormat = {
    id: 'double_elimination',
    name: 'Double elimination',
    build: (seeds, options) => finish('double_elimination', layout(seeds, true, options)),
    placingRules: doublePlacingRules,
};
