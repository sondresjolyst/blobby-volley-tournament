import { MAX_FOZA } from '@/lib/foza';
import { parseId } from '@/lib/http';
import type { BetInput } from '@/lib/store/bets';
import { MATCH_NOT_FOUND, SOMETHING_WENT_WRONG } from '@/lib/texts';

/** A whole number of Foza from 1 to MAX_FOZA from a form field, or null. */
export function parseFoza(value: string | undefined): number | null {
    if (value === undefined || !/^[1-9][0-9]{0,6}$/.test(value.trim())) return null;
    const n = Number(value.trim());
    return n <= MAX_FOZA ? n : null;
}

/** Reads the bet form: matchId, on (the player to back) and amount. Null when a field is missing or wrong. */
export function parseBetForm(form: Record<string, string>): BetInput | null {
    const matchId = parseId(form.matchId ?? '');
    const onPlayerId = parseId(form.on ?? '');
    const amount = parseFoza(form.amount);
    if (matchId === null || onPlayerId === null || amount === null) return null;
    return { matchId, onPlayerId, amount };
}

/** Reads the admin adjustment form: a signed whole amount, not 0, and a reason. Null when wrong. */
export function parseAdjustmentForm(form: Record<string, string>): { amount: number; reason: string } | null {
    const raw = (form.amount ?? '').trim();
    const match = /^([+-]?)([1-9][0-9]{0,6})$/.exec(raw);
    const reason = (form.reason ?? '').trim();
    if (!match || reason.length < 1 || reason.length > 200) return null;
    const size = Number(match[2]);
    if (size > MAX_FOZA) return null;
    return { amount: match[1] === '-' ? -size : size, reason };
}

// Players read these on their own page, which is written in the dialect of the LAN.
const BET_MESSAGES: Record<string, string> = {
    'not-found': MATCH_NOT_FOUND,
    closed: 'Den kampen e stengt for betting.',
    event: 'Du kan bare satsa på kampa på LANet du e med på.',
    side: 'Velg ein av dei to spelarane i kampen.',
    switch: 'Du har allerede satsa på den andre. Du kan høgna bettet, men ikkje bytta side.',
    amount: 'Innsatsen må vera eit heilt tal Foza, minst 1.',
    balance: 'Så mykje Foza har du ikkje.',
    form: SOMETHING_WENT_WRONG,
};

/** The text for a bet error code in the address. Unknown codes show nothing. */
export function betErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(BET_MESSAGES, code) ? BET_MESSAGES[code] : null;
}

const ADJUST_MESSAGES: Record<string, string> = {
    'foza-form': 'Enter a Foza change that is a whole number other than 0, such as 50 or -50, and a reason of up to 200 characters.',
    'foza-balance': 'The change would take the balance below 0. Enter a smaller amount.',
};

/** The text for an adjustment error code in the address. Unknown codes show nothing. */
export function adjustErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(ADJUST_MESSAGES, code) ? ADJUST_MESSAGES[code] : null;
}
