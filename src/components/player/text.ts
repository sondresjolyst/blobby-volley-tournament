// The words of the player pages. They are written in the jokey Rogaland dialect of the LAN.
import type { MatchSummary } from '@/lib/store/matches';
import type { BetStatus } from '@/lib/store/bets';
import { BEST_OF } from '@/lib/bracket';
import { MAX_GAME_SPEED, MAX_SCORE_TO_WIN, MIN_GAME_SPEED, MIN_SCORE_TO_WIN } from '@/lib/matches/settings';
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

/** Such as `Best av 3 · først te 15 · 75 fps`. */
export function matchSettings(match: Pick<MatchSummary, 'bestOf' | 'scoreToWin' | 'speed'>): string {
    return `Best av ${match.bestOf} · først te ${match.scoreToWin} · ${match.speed} fps`;
}

export const BET_STATUS: Record<BetStatus, string> = {
    open: 'Opent',
    won: 'Vunne',
    lost: 'Tapt',
    returned: 'Tebake, ingen satsa på vinnaren',
    refunded: 'Tebake, kampen blei avlyst eller nullstilt',
};

const SETTINGS_LIMITS = `Poeng må vera ${MIN_SCORE_TO_WIN} te ${MAX_SCORE_TO_WIN}, fart ${MIN_GAME_SPEED} te ${MAX_GAME_SPEED} fps, og best av ${BEST_OF.slice(0, -1).join(', ')} eller ${BEST_OF.at(-1)}.`;

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
