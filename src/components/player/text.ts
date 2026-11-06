// The words of the player pages. They are written in the jokey Rogaland dialect of the LAN.
import type { MatchSummary } from '@/lib/store/matches';
import type { BetStatus } from '@/lib/store/bets';
import { boardRoundName } from '@/lib/tournaments/board';

const NUMBER = new Intl.NumberFormat('nb-NO');

/** Such as `1 250 Foza`. */
export function foza(amount: number): string {
    return `${NUMBER.format(amount)} Foza`;
}

/** Such as `betale 1,60×`, or a note while nobody backs the player. */
export function payout(multiplier: number | null): string {
    return multiplier === null ? 'ingen spel enno' : `betale ${multiplier.toFixed(2).replace('.', ',')}×`;
}

/** Such as `Hovedcupen · Semifinala, kamp 1`, or `1v1-utfordring`. */
export function matchTitle(match: MatchSummary): string {
    const round = match.bracketRound;
    if (match.tournamentName === null || round === null) return '1v1-utfordring';
    return `${match.tournamentName} · ${boardRoundName(round.format, round.section, round.round, round.lastRound)}, kamp ${round.position}`;
}

/** Both players, with a placeholder for a slot that is not filled yet. */
export function matchPlayers(match: MatchSummary): string {
    const name = (slot: 0 | 1) => match.players[slot]?.nickname ?? 'Ikkje klart enno';
    return `${name(0)} vs ${name(1)}`;
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
    taken: 'Dåkke har allerede ein open 1v1. Spel han ferdig først.',
    'not-found': 'Den kampen finnes ikkje.',
    'not-allowed': 'Bare den som e utfordra kan svara.',
    state: 'Den utfordringå e allerede svart på.',
};

/** The text for a 1v1 error code in the address. Unknown codes show nothing. */
export function challengeErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(CHALLENGE_MESSAGES, code) ? CHALLENGE_MESSAGES[code] : null;
}

const NOTICES: Record<string, string> = {
    placed: 'Spelet ditt e lagt inn. Lykke te!',
    raised: 'Spelet ditt e høgna. Modig!',
    sent: 'Utfordringå e sendt. No e det opp te motstandaren.',
    accepted: 'Du sa ja. Ein admin rope dåkke opp når det e dykkar tur.',
    declined: 'Du sa nei takk. Kampen e avlyst.',
};

/** The text for a success code in the address. Unknown codes show nothing. */
export function noticeMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(NOTICES, code) ? NOTICES[code] : null;
}
