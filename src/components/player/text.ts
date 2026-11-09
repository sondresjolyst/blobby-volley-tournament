// The words of the player pages. They are written in the jokey Rogaland dialect of the LAN.
import type { MatchSummary } from '@/lib/store/matches';
import type { BetStatus } from '@/lib/store/bets';
import { BEST_OF } from '@/lib/bracket';
import { fixedScoreToWin, MAX_REAL_SCORE_TO_WIN, realScoreToWin, rulesName } from '@/lib/matches/rules';
import { DEFAULT_SCORE_TO_WIN, MAX_GAME_SPEED, MAX_SCORE_TO_WIN, MIN_GAME_SPEED, MIN_SCORE_TO_WIN } from '@/lib/matches/settings';
import { MATCH_NOT_FOUND } from '@/lib/texts';
import { odds } from '../stats/format';

const NUMBER = new Intl.NumberFormat('nb-NO');

/** Such as `1 250 Foza`. */
export function foza(amount: number): string {
    return `${NUMBER.format(amount)} Foza`;
}

/** Such as `betale 1,60×`, or a note while nobody backs the player. */
export function payout(multiplier: number | null): string {
    return multiplier === null ? 'ingen spel ennå' : `betale ${odds(multiplier)}`;
}

/** The quiet note on /me about the daily Foza, such as `Du får 100 Foza kvar dag du e med.` */
export const dailyFozaLine = (daily: number) => `Du får ${foza(daily)} kvar dag du e med.`;

/** The notice on /me on a day the player got the daily Foza, such as `Du fekk 100 Foza for i dag!` */
export const dailyFozaNotice = (paid: number) => `Du fekk ${foza(paid)} for i dag!`;

/** Such as `Best av 3 · Tennis · først te 15 · 75 fps`. The points are the ones the rules really play to. */
export function matchSettings(match: Pick<MatchSummary, 'bestOf' | 'ruleFile' | 'scoreToWin' | 'speed'>): string {
    return `Best av ${match.bestOf} · ${rulesName(match.ruleFile)} · først te ${realScoreToWin(match.ruleFile, match.scoreToWin)} · ${match.speed} fps`;
}

/**
 * The hint under the points field of the 1v1 form. Lyn always plays to 2, and Brannmur plays to 10
 * times the points, such as `Brannmur gonge med 10, så dåkke spele te 150`.
 */
export function pointsHint(ruleFile: string, scoreToWin: number): string {
    if (fixedScoreToWin(ruleFile)) return `${rulesName(ruleFile)} spele alltid te ${realScoreToWin(ruleFile, scoreToWin)}`;
    if (realScoreToWin(ruleFile, scoreToWin) !== scoreToWin) return `${rulesName(ruleFile)} gonge med 10, så dåkke spele te ${realScoreToWin(ruleFile, scoreToWin)}. Høgst ${MAX_REAL_SCORE_TO_WIN / 10}`;
    return `poeng i kvart sett, ${MIN_SCORE_TO_WIN} te ${MAX_SCORE_TO_WIN}, vanleg e ${DEFAULT_SCORE_TO_WIN}`;
}

/**
 * The settings of a bracket round, such as `Best av 3 · Tennis`. When the rules change the points
 * of the tournament, the real points come last, such as `Best av 1 · Lyn · først te 2`.
 */
export function roundSettings(round: { bestOf: number; ruleFile: string }, scoreToWin: number): string {
    const real = realScoreToWin(round.ruleFile, scoreToWin);
    return `Best av ${round.bestOf} · ${rulesName(round.ruleFile)}${real === scoreToWin ? '' : ` · først te ${real}`}`;
}

export const BET_STATUS: Record<BetStatus, string> = {
    open: 'Opent',
    won: 'Vunne',
    lost: 'Tapt',
    returned: 'Tebake, ingen satsa på vinnaren',
    refunded: 'Tebake, kampen blei avlyst eller nullstilt',
};

const SETTINGS_LIMITS = `Velg regla frå lista. Poeng må vera ${MIN_SCORE_TO_WIN} te ${MAX_SCORE_TO_WIN}, eller høgst ${MAX_REAL_SCORE_TO_WIN / 10} med Brannmur. Fart må vera ${MIN_GAME_SPEED} te ${MAX_GAME_SPEED} fps, og best av ${BEST_OF.slice(0, -1).join(', ')} eller ${BEST_OF.at(-1)}.`;

const CHALLENGE_MESSAGES: Record<string, string> = {
    form: `Velg ein motstandar. ${SETTINGS_LIMITS}`,
    settings: SETTINGS_LIMITS,
    players: 'Du kan ikkje utfordra deg sjøl.',
    'no-event': 'Begge må vera med på LANet som e i gang.',
    taken: 'Dåkke to har allerede ein 1v1 som ikkje e ferdig. Svar på utfordringå, eller spel ferdig den kampen først.',
    'not-found': MATCH_NOT_FOUND,
    'not-allowed': 'Bare den som e utfordra kan svara, og bare den som utfordra kan trekka tebake.',
    state: 'Den utfordringå e allerede svart på eller trekt tebake.',
};

/** The text for a 1v1 error code in the address. Unknown codes show nothing. */
export function challengeErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(CHALLENGE_MESSAGES, code) ? CHALLENGE_MESSAGES[code] : null;
}

const NOTICES: Record<string, string> = {
    placed: 'Spelet ditt e lagt inn. Lykke te!',
    raised: 'Spelet ditt e høgna. Modig!',
    sent: 'Utfordringå e sendt. Nå e det opp te motstandaren.',
    accepted: 'Du godtok kampen. Dåkke kan spela med ein gang.',
    queued: 'Du godtok kampen. Dåkke kan spela så fort begge e klare.',
    declined: 'Du sa nei takk. Kampen e avlyst.',
    withdrawn: 'Du trakk utfordringå tebake.',
};

/** The text for a success code in the address. Unknown codes show nothing. */
export function noticeMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(NOTICES, code) ? NOTICES[code] : null;
}
