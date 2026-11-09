import { randomInt } from 'node:crypto';
import { NAME_LENGTH_ERROR, NO_ACTIVE_EVENT } from '@/lib/admin-texts';
import {
    BEST_OF_ERROR,
    DEFAULT_RULES,
    generateBracket,
    isBestOf,
    isFormatId,
    MAX_PLAYERS,
    MAX_RANDOM_SEED,
    MIN_PLAYERS,
    SEEDING_METHODS,
    THIRD_PLACE_MIN_PLAYERS,
    type FormatId,
    type PlannedBracket,
    type RoundSettings,
    type Seeding,
    type SeedingMethod,
} from '@/lib/bracket';
import { parseId } from '@/lib/http';
import { fitsScoreToWin, isGameRules, MAX_REAL_SCORE_TO_WIN } from '@/lib/matches/rules';
import { DEFAULT_GAME_SPEED, DEFAULT_SCORE_TO_WIN, formNumber, isGameSpeed, isScoreToWin, MAX_GAME_SPEED, MAX_SCORE_TO_WIN, MIN_GAME_SPEED, MIN_SCORE_TO_WIN } from '@/lib/matches/settings';

export const SEEDING_LABELS: Record<SeedingMethod, string> = { random: 'Random', manual: 'By hand', elo: 'By Elo rating' };

/** Reads every value of a form field. Both URLSearchParams and FormData work through it. */
export type FieldReader = (name: string) => string[];

export function fieldsOf(source: { getAll(name: string): unknown[] }): FieldReader {
    return (name) => source.getAll(name).filter((value): value is string => typeof value === 'string');
}

/** Turns the search params of a page into URLSearchParams, keeping repeated fields. */
export function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(record)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
    }
    return params;
}

export interface TournamentDraft {
    name: string;
    format: FormatId;
    seeding: SeedingMethod;
    randomSeed: number;
    /** The chosen players, the lowest id first. */
    playerIds: number[];
    /** The hand seeding, seed 1 first. Only set for hand seeding. */
    manualOrder: number[] | null;
    thirdPlaceMatch: boolean;
    /** Points that win a game, in every match of the tournament. */
    scoreToWin: number;
    /** Game speed in frames per second, in every match of the tournament. */
    speed: number;
    /** Best-of and rules by round key, from the fields the form had. */
    rounds: Record<string, RoundSettings>;
    /** The bracket the round fields were shown for, from the last preview. Empty before a preview. */
    roundsFor: string;
}

export type DraftError = 'name' | 'format' | 'seeding' | 'random-seed' | 'players' | 'seeds' | 'third-place' | 'best-of' | 'rules' | 'rules-points' | 'score-to-win' | 'speed';

export type DraftResult = { ok: true; value: TournamentDraft } | { ok: false; error: DraftError };

export const bestOfField = (roundKey: string) => `bestOf_${roundKey}`;
export const rulesField = (roundKey: string) => `rules_${roundKey}`;
export const seedField = (playerId: number) => `seed_${playerId}`;

// More rounds than any section can have. 32 players give 5 winners rounds and 8 losers rounds.
const MAX_ROUNDS = 16;
const SEED = /^[1-9][0-9]?$/;

export function newRandomSeed(): number {
    return randomInt(0, MAX_RANDOM_SEED + 1);
}

const first = (read: FieldReader, name: string) => (read(name)[0] ?? '').trim();

/** Reads the tournament form. Round fields are read for every round key a bracket can have. */
export function parseTournamentDraft(read: FieldReader): DraftResult {
    const name = first(read, 'name');
    if (name.length < 1 || name.length > 100) return { ok: false, error: 'name' };
    const format = first(read, 'format');
    if (!isFormatId(format)) return { ok: false, error: 'format' };
    const seeding = first(read, 'seeding');
    if (!(SEEDING_METHODS as readonly string[]).includes(seeding)) return { ok: false, error: 'seeding' };
    const seedText = first(read, 'randomSeed');
    const randomSeed = /^[0-9]{1,10}$/.test(seedText) ? Number(seedText) : NaN;
    if (!(randomSeed >= 0 && randomSeed <= MAX_RANDOM_SEED)) return { ok: false, error: 'random-seed' };

    const ids = read('player').map((value) => parseId(value.trim()));
    if (ids.some((id) => id === null)) return { ok: false, error: 'players' };
    const playerIds = [...new Set(ids as number[])].sort((a, b) => a - b);
    if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) return { ok: false, error: 'players' };

    let manualOrder: number[] | null = null;
    if (seeding === 'manual') {
        const bySeed = new Map<number, number>();
        for (const id of playerIds) {
            const value = first(read, seedField(id));
            const seed = SEED.test(value) ? Number(value) : 0;
            if (seed < 1 || seed > playerIds.length || bySeed.has(seed)) return { ok: false, error: 'seeds' };
            bySeed.set(seed, id);
        }
        manualOrder = playerIds.map((_, i) => bySeed.get(i + 1)!);
    }

    // The box only counts for single elimination. Double elimination has no third place match.
    const thirdPlaceMatch = format === 'single_elimination' && first(read, 'thirdPlace') !== '';
    if (thirdPlaceMatch && playerIds.length < THIRD_PLACE_MIN_PLAYERS) return { ok: false, error: 'third-place' };

    const scoreToWin = formNumber(first(read, 'scoreToWin'), DEFAULT_SCORE_TO_WIN);
    if (!isScoreToWin(scoreToWin)) return { ok: false, error: 'score-to-win' };
    const speed = formNumber(first(read, 'speed'), DEFAULT_GAME_SPEED);
    if (!isGameSpeed(speed)) return { ok: false, error: 'speed' };

    const rounds: Record<string, RoundSettings> = {};
    for (const section of ['winners', 'losers', 'third_place', 'final'] as const) {
        for (let number = 1; number <= MAX_ROUNDS; number++) {
            const key = `${section}-${number}`;
            const bestOfText = first(read, bestOfField(key));
            const rulesText = first(read, rulesField(key));
            if (!bestOfText && !rulesText) continue;
            const bestOf = Number(bestOfText || '1');
            if (!/^[0-9]$/.test(bestOfText || '1') || !isBestOf(bestOf)) return { ok: false, error: 'best-of' };
            const ruleFile = rulesText || DEFAULT_RULES;
            if (!isGameRules(ruleFile)) return { ok: false, error: 'rules' };
            if (!fitsScoreToWin(ruleFile, scoreToWin)) return { ok: false, error: 'rules-points' };
            rounds[key] = { bestOf, ruleFile };
        }
    }

    const roundsFor = first(read, 'roundsFor');
    return { ok: true, value: { name, format, seeding: seeding as SeedingMethod, randomSeed, playerIds, manualOrder, thirdPlaceMatch, scoreToWin, speed, rounds, roundsFor } };
}

/** Builds the bracket for a draft. For Elo seeding the caller passes the ratings, and a player without one counts as 1000. */
export function planTournament(draft: TournamentDraft, ratings: ReadonlyMap<number, number> = new Map()): PlannedBracket {
    const seeding: Seeding =
        draft.seeding === 'random'
            ? { method: 'random', seed: draft.randomSeed }
            : draft.seeding === 'manual'
              ? { method: 'manual', order: draft.manualOrder ?? [] }
              : { method: 'elo', ratings };
    return generateBracket({ format: draft.format, players: draft.playerIds, seeding, thirdPlaceMatch: draft.thirdPlaceMatch, rounds: draft.rounds });
}

/**
 * Names the shape of a bracket: format, player count, third place match and round keys. The
 * preview puts it in the form, so a save can tell that the round fields were shown for this shape.
 */
export function roundsSignature(plan: PlannedBracket): string {
    return [plan.format, plan.seeds.length, plan.thirdPlaceMatch ? 'third' : 'no-third', plan.rounds.map((r) => r.key).join(',')].join(' ');
}

/**
 * True when the round settings in the form belong to this bracket. After the players or the
 * format change, the same round key can name another round, so a save needs a fresh preview.
 */
export function roundsMatch(draft: TournamentDraft, plan: PlannedBracket): boolean {
    const keys = new Set(plan.rounds.map((r) => r.key));
    return draft.roundsFor === roundsSignature(plan) && Object.keys(draft.rounds).every((key) => keys.has(key));
}

const DRAFT_ERRORS: Record<string, string> = {
    name: NAME_LENGTH_ERROR,
    format: 'Select a format.',
    seeding: 'Select how to seed the players.',
    'random-seed': `The random seed must be a whole number from 0 to ${MAX_RANDOM_SEED}.`,
    players: `Select ${MIN_PLAYERS} to ${MAX_PLAYERS} players from the event.`,
    seeds: 'For hand seeding, give each chosen player a different seed from 1 to the number of players.',
    'third-place': `A third place match needs at least ${THIRD_PLACE_MIN_PLAYERS} players.`,
    rounds: 'The players or the format changed after the preview. Select Preview and check the rounds again before you save.',
    'best-of': BEST_OF_ERROR,
    rules: 'Pick the rules of each round from the list.',
    'rules-points': `Brannmur plays to 10 times the points to win, so with Brannmur the points to win can be at most ${MAX_REAL_SCORE_TO_WIN / 10}.`,
    'score-to-win': `Points to win a game must be a whole number from ${MIN_SCORE_TO_WIN} to ${MAX_SCORE_TO_WIN}.`,
    speed: `Game speed must be a whole number from ${MIN_GAME_SPEED} to ${MAX_GAME_SPEED} frames per second.`,
    'no-event': NO_ACTIVE_EVENT,
};

export function tournamentErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(DRAFT_ERRORS, code) ? DRAFT_ERRORS[code] : null;
}
