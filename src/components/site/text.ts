// The words of the front page and the parts every page shares, in the jokey Rogaland dialect of the LAN.

/** The label of every sponsor strip, on the big screen and under the pages. */
export const SPONSORS_LABEL = 'Stolt sponsa av';

const DAY = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const FULL = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The dates of an event from `YYYY-MM-DD`, such as `20. te 22. november 2026`. */
export function eventDates(startsOn: string, endsOn: string): string {
    const start = new Date(`${startsOn}T00:00:00Z`);
    const end = new Date(`${endsOn}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
    if (startsOn === endsOn) return FULL.format(start);
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    const first = sameMonth ? DAY.format(start) : sameYear ? DAY_MONTH.format(start) : FULL.format(start);
    return `${first} te ${FULL.format(end)}`;
}
