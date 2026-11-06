import { parseId } from '@/lib/http';
import type { BetInput } from '@/lib/store/bets';

/** A whole number of Foza from 1 to 1000000 from a form field, or null. */
export function parseFoza(value: string | undefined): number | null {
    if (value === undefined || !/^[1-9][0-9]{0,6}$/.test(value.trim())) return null;
    const n = Number(value.trim());
    return n <= 1_000_000 ? n : null;
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
    if (size > 1_000_000) return null;
    return { amount: match[1] === '-' ? -size : size, reason };
}

const BET_MESSAGES: Record<string, string> = {
    'not-found': 'That match does not exist.',
    closed: 'Bets on that match are closed.',
    event: 'You can only bet on matches in your active event.',
    side: 'Pick one of the two players in the match.',
    switch: 'You already back the other player. You can raise your bet, but not move it.',
    amount: 'The amount must be a whole number of Foza, at least 1.',
    balance: 'You do not have that much Foza.',
    form: 'Something went wrong. Try again.',
};

/** The text for a bet error code in the address. Unknown codes show nothing. */
export function betErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(BET_MESSAGES, code) ? BET_MESSAGES[code] : null;
}

const ADJUST_MESSAGES: Record<string, string> = {
    'foza-form': 'The Foza change must be a whole number other than 0, and the reason 1 to 200 characters.',
    'foza-balance': 'That would take the balance below 0.',
};

/** The text for an adjustment error code in the address. Unknown codes show nothing. */
export function adjustErrorMessage(code: string | string[] | undefined): string | null {
    if (typeof code !== 'string') return null;
    return Object.hasOwn(ADJUST_MESSAGES, code) ? ADJUST_MESSAGES[code] : null;
}
