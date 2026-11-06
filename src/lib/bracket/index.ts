import { doubleElimination, singleElimination } from './elimination';
import { placings } from './placings';
import { seedPlayers, type Seeding } from './seeding';
import type { Bracket, BracketFormat, BracketMatch, BracketRound, FormatId, Placing, PlacingRule } from './types';

export * from './types';
export { roundName, THIRD_PLACE_MIN_PLAYERS } from './elimination';
export { playersAfter } from './placings';
export { seedPlayers, seededRandom, DEFAULT_ELO, MAX_RANDOM_SEED, SEEDING_METHODS, type Seeding, type SeedingMethod } from './seeding';

/** The formats this site can build. A new format only needs an entry here. */
export const FORMATS: Readonly<Record<FormatId, BracketFormat>> = {
    single_elimination: singleElimination,
    double_elimination: doubleElimination,
};

export function isFormatId(value: unknown): value is FormatId {
    return typeof value === 'string' && Object.hasOwn(FORMATS, value);
}

export const BEST_OF = [1, 3, 5, 7] as const;
export type BestOf = (typeof BEST_OF)[number];

/** The normal game rules. */
export const DEFAULT_RULES = 'default.lua';

const RULE_FILE = /^[A-Za-z0-9_-]{1,60}\.lua$/;

/** A rule file is a plain file name that ends in .lua, with no folder in it. */
export function isRuleFile(value: string): boolean {
    return RULE_FILE.test(value);
}

export function isBestOf(value: number): value is BestOf {
    return (BEST_OF as readonly number[]).includes(value);
}

export interface RoundSettings {
    bestOf: BestOf;
    ruleFile: string;
}

export type PlannedRound = BracketRound & RoundSettings;
export type PlannedMatch = BracketMatch & RoundSettings;

export interface PlannedBracket {
    format: FormatId;
    /** Player ids in seed order, seed 1 first. */
    seeds: number[];
    thirdPlaceMatch: boolean;
    rounds: PlannedRound[];
    matches: PlannedMatch[];
}

export interface BracketRequest {
    format: FormatId;
    players: readonly number[];
    seeding: Seeding;
    /** Single elimination only. Off by default. */
    thirdPlaceMatch?: boolean;
    /** Settings by round key. A round without settings is best of 1 with the default rules. */
    rounds?: Readonly<Record<string, Partial<RoundSettings>>>;
}

/** Seeds the players, builds the bracket and puts the best-of and rules of each round on its matches. */
export function generateBracket(request: BracketRequest): PlannedBracket {
    const seeds = seedPlayers(request.players, request.seeding);
    const thirdPlaceMatch = request.thirdPlaceMatch ?? false;
    const bracket: Bracket = FORMATS[request.format].build(seeds, { thirdPlaceMatch });
    const rounds = bracket.rounds.map((round): PlannedRound => {
        const settings = request.rounds && Object.hasOwn(request.rounds, round.key) ? request.rounds[round.key] : {};
        const bestOf = settings.bestOf ?? 1;
        const ruleFile = settings.ruleFile ?? DEFAULT_RULES;
        if (!isBestOf(bestOf)) throw new Error('Best of must be 1, 3, 5 or 7.');
        if (!isRuleFile(ruleFile)) throw new Error('The rule file name is not valid.');
        return { ...round, bestOf, ruleFile };
    });
    const byKey = new Map(rounds.map((round) => [round.key, round]));
    const matches = bracket.matches.map((match): PlannedMatch => {
        const round = byKey.get(`${match.section}-${match.round}`)!;
        return { ...match, bestOf: round.bestOf, ruleFile: round.ruleFile };
    });
    return { format: bracket.format, seeds, thirdPlaceMatch, rounds, matches };
}

/** Which match results decide the final places of a bracket. */
export function placingRules(bracket: Pick<Bracket, 'format' | 'matches'>): PlacingRule[] {
    return FORMATS[bracket.format].placingRules({ rounds: [], ...bracket });
}

/**
 * The final places decided so far, from the winner of each played match by match id. 1st and 2nd
 * come from the final. In double elimination 3rd is the loser of the losers final. In single
 * elimination 3rd and 4th come from the third place match, or both semifinal losers share 3rd.
 */
export function finalPlacings(bracket: Pick<Bracket, 'format' | 'matches'>, winners: ReadonlyMap<number, number>): Placing[] {
    return placings({ rounds: [], ...bracket }, placingRules(bracket), winners);
}
