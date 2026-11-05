import { doubleElimination, singleElimination } from './elimination';
import { seedPlayers, type Seeding } from './seeding';
import type { Bracket, BracketFormat, BracketMatch, BracketRound, FormatId } from './types';

export * from './types';
export { roundName } from './elimination';
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
    rounds: PlannedRound[];
    matches: PlannedMatch[];
}

export interface BracketRequest {
    format: FormatId;
    players: readonly number[];
    seeding: Seeding;
    /** Settings by round key. A round without settings is best of 1 with the default rules. */
    rounds?: Readonly<Record<string, Partial<RoundSettings>>>;
}

/** Seeds the players, builds the bracket and puts the best-of and rules of each round on its matches. */
export function generateBracket(request: BracketRequest): PlannedBracket {
    const seeds = seedPlayers(request.players, request.seeding);
    const bracket: Bracket = FORMATS[request.format].build(seeds);
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
    return { format: bracket.format, seeds, rounds, matches };
}
