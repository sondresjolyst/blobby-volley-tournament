// Types for the bracket module. The module has no database access, so it can be tested on its own.

export type FormatId = 'single_elimination' | 'double_elimination';

/** The part of a bracket a match belongs to. Single elimination only uses winners. */
export type Section = 'winners' | 'losers' | 'final';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 32;

/** Where the winner or the loser of a match goes next. Slot 1 or 2 of that match. */
export interface MatchLink {
    matchId: number;
    slot: 1 | 2;
}

export interface BracketRound {
    /** Unique in the bracket, such as `winners-1`. Round settings use it. */
    key: string;
    section: Section;
    /** Starts at 1 in each section. */
    number: number;
    name: string;
}

export interface BracketMatch {
    /** Starts at 1. A match only links to matches with a higher id, so the ids are a valid play order. */
    id: number;
    section: Section;
    round: number;
    /** Starts at 1 in each round. */
    position: number;
    /**
     * The players placed at the start. A slot that is null is filled later by the match that links to it.
     * A player with a bye is placed straight into the first match the player plays.
     */
    players: [number | null, number | null];
    winnerTo: MatchLink | null;
    loserTo: MatchLink | null;
}

export interface Bracket {
    format: FormatId;
    rounds: BracketRound[];
    matches: BracketMatch[];
}

/**
 * A bracket format. It gets the player ids in seed order, seed 1 first, and returns the bracket.
 * Round robin or other formats can be added later behind the same interface.
 */
export interface BracketFormat {
    id: FormatId;
    name: string;
    build(seeds: readonly number[]): Bracket;
}
