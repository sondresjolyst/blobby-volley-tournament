import { DEFAULT_RULES, isBestOf } from '@/lib/bracket';
import { parseId } from '@/lib/http';
import { DEFAULT_GAME_SPEED, DEFAULT_SCORE_TO_WIN, formNumber, isGameSpeed, isPoints, isScoreToWin } from './settings';
import { fitsScoreToWin, isGameRules } from './rules';
import type { MatchState } from './state';

/** A whole number from 0 to MAX_POINTS from a form field, or null. */
export function parseCount(value: string | undefined): number | null {
    if (value === undefined || !/^[0-9]{1,4}$/.test(value.trim())) return null;
    const n = Number(value.trim());
    return isPoints(n) ? n : null;
}

/** Slot 1 or 2 from a form field, or null. */
export function parseSlot(value: string | undefined): 1 | 2 | null {
    return value === '1' ? 1 : value === '2' ? 2 : null;
}

/** The match ids picked in the call form. Repeated and bad ids are dropped. At most 64. */
export function parseMatchIds(values: readonly string[]): number[] {
    const ids = values.map(parseId).filter((id): id is number => id !== null);
    return [...new Set(ids)].slice(0, 64);
}

export const MATCH_ACTIONS = ['call', 'restart', 'game', 'score', 'no-show', 'cancel', 'reset'] as const;
export type MatchFormAction = (typeof MATCH_ACTIONS)[number];

export type MatchForm =
    | { action: 'call' | 'restart' | 'cancel' | 'reset' }
    | { action: 'game'; game: number; winnerSlot: 1 | 2 | null; points1: number; points2: number }
    | { action: 'score'; score1: number; score2: number }
    | { action: 'no-show'; absentSlot: 1 | 2 };

/** Reads a form from the match page. Returns null when a field is missing or wrong. */
export function parseMatchForm(form: Record<string, string>): MatchForm | null {
    switch (form.action) {
        case 'call':
        case 'restart':
        case 'cancel':
        case 'reset':
            return { action: form.action };
        case 'game': {
            const game = parseId(form.game ?? '');
            const points1 = parseCount(form.points1);
            const points2 = parseCount(form.points2);
            const winnerSlot = form.winner === 'abandoned' ? null : parseSlot(form.winner);
            if (game === null || points1 === null || points2 === null || (winnerSlot === null && form.winner !== 'abandoned')) return null;
            return { action: 'game', game, winnerSlot, points1, points2 };
        }
        case 'score': {
            const score1 = parseCount(form.score1);
            const score2 = parseCount(form.score2);
            if (score1 === null || score2 === null) return null;
            return { action: 'score', score1, score2 };
        }
        case 'no-show': {
            const absentSlot = parseSlot(form.absent);
            return absentSlot === null ? null : { action: 'no-show', absentSlot };
        }
        default:
            return null;
    }
}

export interface ChallengeForm {
    opponentId: number;
    bestOf: number;
    ruleFile: string;
    scoreToWin: number;
    speed: number;
}

/**
 * Reads the form a player sends to ask another player for a 1v1 match. An empty best-of, rules,
 * points or speed gives 1, default.lua, 15 and 75. The rules must be one of GAME_RULES. Returns
 * null when a field is missing or out of bounds.
 */
export function parseChallengeForm(form: Record<string, string>): ChallengeForm | null {
    const opponentId = parseId(form.opponent ?? '');
    const bestOf = formNumber(form.bestOf ?? '', 1);
    const ruleFile = (form.ruleFile ?? '').trim() || DEFAULT_RULES;
    const scoreToWin = formNumber(form.scoreToWin ?? '', DEFAULT_SCORE_TO_WIN);
    const speed = formNumber(form.speed ?? '', DEFAULT_GAME_SPEED);
    if (opponentId === null || bestOf === null || !isBestOf(bestOf) || !isGameRules(ruleFile) || !isScoreToWin(scoreToWin) || !fitsScoreToWin(ruleFile, scoreToWin) || !isGameSpeed(speed)) return null;
    return { opponentId, bestOf, ruleFile, scoreToWin, speed };
}

export const CHALLENGE_ANSWERS = ['accept', 'decline', 'withdraw'] as const;
export type ChallengeAnswer = (typeof CHALLENGE_ANSWERS)[number];

/** Reads an answer to a 1v1 match: accept or decline from the asked player, withdraw from the asker. Null for anything else. */
export function parseChallengeAnswer(form: Record<string, string>): ChallengeAnswer | null {
    return (CHALLENGE_ANSWERS as readonly string[]).includes(form.answer) ? (form.answer as ChallengeAnswer) : null;
}

export const STATE_LABELS: Record<MatchState, string> = {
    upcoming: 'Upcoming',
    called: 'Called',
    started: 'Started',
    finished: 'Finished',
    cancelled: 'Cancelled',
};

const MESSAGES: Record<string, string> = {
    form: 'A field is missing or not valid. Check the form and try again.',
    'not-found': 'The match was not found.',
    state: 'The match is not in a state that allows this.',
    players: 'Both players must be known first.',
    'player-busy': 'A player is already in a called or started match. Finish, reset or cancel that match first.',
    'not-accepted': 'The other player has not accepted this 1v1 match yet.',
    game: 'The game must be one of the games played or the next one.',
    score: 'The score is not valid. The winner of a game must have more points, and a series score must fit the best-of.',
    forfeit: 'This match was decided by a no-show. Its games cannot change it.',
    decided: 'The series is decided, so no more games can be added. Correct a game that was played instead.',
    'downstream-played': 'The change would move a player out of a later match that is already called, started or finished. Reset that match to upcoming first.',
    'tournament-cancel': 'A tournament match cannot be cancelled, since the bracket could not move on. Record a no-show instead.',
};

/** The text for an error code in the address. Unknown codes show nothing. */
export function matchErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}
