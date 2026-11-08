// The words of the player pages. They are written in the jokey Rogaland dialect of the LAN.
import type { MatchSummary } from '@/lib/store/matches';
import type { BetStatus } from '@/lib/store/bets';
import { MATCH_NOT_FOUND } from '@/lib/texts';
import { odds } from '../stats/format';

const NUMBER = new Intl.NumberFormat('nb-NO');

/** Such as `1 250 Foza`. */
export function foza(amount: number): string {
    return `${NUMBER.format(amount)} Foza`;
}

/** Such as `betale 1,60×`, or a note while nobody backs the player. */
export function payout(multiplier: number | null): string {
    return multiplier === null ? 'ingen spel enno' : `betale ${odds(multiplier)}`;
}

/** Such as `Best av 3 · først te 15 · 75 fps`. */
export function matchSettings(match: Pick<MatchSummary, 'bestOf' | 'scoreToWin' | 'speed'>): string {
    return `Best av ${match.bestOf} · først te ${match.scoreToWin} · ${match.speed} fps`;
}

export const BET_STATUS: Record<BetStatus, string> = {
    open: 'Opent',
    won: 'Vunne',
    lost: 'Tapt',
    returned: 'Fekk innsatsen tebake, ingen satsa på vinnaren',
    refunded: 'Betalt tebake',
};

const CHALLENGE_MESSAGES: Record<string, string> = {
    form: 'Velg ein motstandar. Poeng må vera 1 te 99, fart 30 te 120 fps, og best av 1, 3, 5 eller 7.',
    settings: 'Poeng må vera 1 te 99, fart 30 te 120 fps, og best av 1, 3, 5 eller 7.',
    players: 'Du kan ikkje utfordra deg sjøl.',
    'no-event': 'Begge må vera med på LANet som e i gang.',
    taken: 'Dåkke har allerede ein open 1v1. Spel ferdig den kampen først.',
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
