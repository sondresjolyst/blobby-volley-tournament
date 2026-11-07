// The words of the big screen, in the same jokey Rogaland dialect as the player pages.
import type { BoardKey, ScreenMatch } from '@/lib/big-screen/view';
import type { MatchState } from '@/lib/matches/state';
import { foza } from '@/components/player/text';

export const BOARD_TEXT: Record<BoardKey, { tab: string; title: string; empty: string }> = {
    rette: { tab: 'Flest rette', title: 'Flest rette spel', empty: 'Ingen spel e avgjort enno. Sett nokke Foza på ein kamp, då!' },
    sigra: { tab: 'Flest sigra', title: 'Flest sigra', empty: 'Ingen kampar e ferdigspelt enno. Det tar seg opp, sjå.' },
    elo: { tab: 'Elo', title: 'Elo-toppen', empty: 'Ingen spelarar her enno.' },
};

const PILL_STATE: Partial<Record<MatchState, string>> = { started: 'LIVE', called: 'ROPT OPP', upcoming: 'SNART' };

/** The state and the round of a match for the pill and the tags, such as `LIVE` and `Semifinala, kamp 1`. */
export function matchPill(match: Pick<ScreenMatch, 'state' | 'label'>): { state: string; label: string } {
    return { state: PILL_STATE[match.state] ?? '', label: match.label };
}

/** The line under the pool bar when nobody has bet yet. */
export function poolLine(match: Pick<ScreenMatch, 'open' | 'pool'>): string {
    if (match.pool > 0) return `${foza(match.pool)} i potten`;
    return match.open ? 'Ingen har satsa enno. Ka dåkke venta på? Sats på /me!' : 'Ingen spel på denne. Spelet e stengt.';
}

/** A series score in the bracket, or nothing before the match starts. */
export const slotScore = (score: number | null) => (score === null ? '' : String(score));

export const SIDE_NAMES = { main: 'Vinnarsida', losers: 'Tapersida' } as const;

/** The note under a round with matches left out, such as `+ 4 kampar te`. */
export const moreMatches = (n: number) => `+ ${n} ${n === 1 ? 'kamp' : 'kampar'} te`;

/** The line on the sign-up card. Without the key the code is not on the screen, so a player asks an admin. */
export function joinLine(hasCode: boolean, hasQr: boolean): string {
    if (!hasCode) return 'Spør ein admin om koden, så gå te /join.';
    return hasQr ? 'Skann, så bruka koden' : 'Gå te /join, så bruka koden';
}

/** A place on a leaderboard nobody has taken yet. */
export const FREE_PLACE = 'Ledig plass';

export const NO_MATCH = { title: 'Ingen kampar på golvet enno', text: 'Admin varme opp ovnen. Sjekk topplista så lenge.' };
export const NO_BRACKET = 'Ingen turneringa enno. Admin snekre nok på det, så finn fram ostepoppen så lenge.';
export const NO_EVENT = { title: 'Ingen LAN i gang enno', text: 'Finn fram pizzaen og vent litt. Skjermen vakne av seg sjøl.' };
