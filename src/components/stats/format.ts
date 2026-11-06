// Numbers on the leaderboards, written the way the pages write them.
import { shownRating } from '@/lib/stats/elo';

const whole = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

/** A whole number with a space between thousands, such as `3 420`. */
export const number = (n: number) => whole.format(n);

/** A share from 0 to 1 as a whole percent, such as `82%`. A dash before there is anything to count. */
export const percent = (share: number | null) => (share === null ? '-' : `${Math.round(share * 100)}%`);

/** A number with its sign, such as `+84` or `-12`. 0 has no sign. */
export function signed(n: number): string {
    const rounded = Math.round(n);
    if (rounded === 0) return '0';
    return rounded > 0 ? `+${number(rounded)}` : `-${number(-rounded)}`;
}

/** The change of a rating, from the shown ratings, so the change always matches the numbers next to it. */
export const ratingChange = (start: number, end: number) => signed(shownRating(end) - shownRating(start));

/** Payout divided by stake, such as `4.2×`. */
export const odds = (multiplier: number) => `${Number(multiplier.toFixed(2))}×`;
