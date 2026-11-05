import { MAX_PLAYERS, MIN_PLAYERS, type Bracket, type BracketFormat, type BracketMatch, type BracketRound, type FormatId, type Section } from './types';

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

function layout(seeds: readonly number[], double: boolean): Slot[] {
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
    if (!double) return slots;

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
            // The losers of the next winners round drop in. Every other time in reverse order, so
            // players who met in the winners bracket do not meet again at once.
            const drop = winners[k].map((slot) => slot.loser);
            if (k % 2 === 1) drop.reverse();
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

const SECTIONS: Section[] = ['winners', 'losers', 'final'];

export function roundName(format: FormatId, section: Section, number: number, last: number): string {
    if (section === 'final') return 'Grand final';
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

export const singleElimination: BracketFormat = {
    id: 'single_elimination',
    name: 'Single elimination',
    build: (seeds) => finish('single_elimination', layout(seeds, false)),
};

/**
 * Double elimination. A player who loses in the winners bracket drops to the losers bracket. The
 * winners bracket champion meets the losers bracket champion once in the grand final. There is no
 * reset match.
 */
export const doubleElimination: BracketFormat = {
    id: 'double_elimination',
    name: 'Double elimination',
    build: (seeds) => finish('double_elimination', layout(seeds, true)),
};
