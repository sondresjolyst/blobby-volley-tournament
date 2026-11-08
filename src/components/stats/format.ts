// Numbers on the leaderboards, written the way the pages write them.
import { signed } from '@/lib/format';
import { shownRating } from '@/lib/stats/elo';

export { number, signed } from '@/lib/format';

/** A share from 0 to 1 as a whole percent, such as `82%`. A dash before there is anything to count. */
export const percent = (share: number | null) => (share === null ? '-' : `${Math.round(share * 100)}%`);

/** The change of a rating, from the shown ratings, so the change always matches the numbers next to it. */
export const ratingChange = (start: number, end: number) => signed(shownRating(end) - shownRating(start));

const twoDecimals = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Payout divided by stake with a decimal comma, such as `4,20×`. Every page writes odds this way. */
export const odds = (multiplier: number) => `${twoDecimals.format(multiplier)}×`;
