// The words of the big screen, in the same jokey Rogaland dialect as the player pages.
import type { BoardKey, ScreenMatch } from '@/lib/big-screen/view';
import type { MatchState } from '@/lib/matches/state';
import { foza, payout } from '@/components/player/text';

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

/** The points of the game being played, such as `11–8`. */
export const livePoints = (live: NonNullable<ScreenMatch['live']>) => `${live.points[0]}–${live.points[1]}`;

/** What one Foza on each side pays back, such as `1,33× / 4,00×`, or a note while nobody has bet. */
export function matchOdds(match: Pick<ScreenMatch, 'pool' | 'sides'>): string {
    if (match.pool <= 0) return 'Ingen spel enno';
    return `${payout(match.sides[0].multiplier).replace('betale ', '')} / ${payout(match.sides[1].multiplier).replace('betale ', '')}`;
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

/** The line on the sign-up card, with or without the QR code. */
export const joinLine = (hasQr: boolean) => (hasQr ? 'Skann, så bruka koden' : 'Gå te /join, så bruka koden');

/** A place on a leaderboard nobody has taken yet. */
export const FREE_PLACE = 'Ledig plass';

export const NO_MATCH = { title: 'Ingen kampar på golvet enno', text: 'Admin varme opp ovnen. Sjekk topplista så lenge.' };
export const NO_BRACKET = 'Ingen turneringar.';
export const NO_EVENT = { title: 'Ingen LAN i gang enno', text: 'Finn fram pizzaen og vent litt. Skjermen vakne av seg sjøl.' };

/** The names of the screens, as their regions are labelled. */
export const SCREEN_LABELS = {
    bracket: 'Heile kampoppsettet',
    foza: 'Foza-toppen',
    next: 'Neste kampar',
    stats: 'Rekordar',
    sponsors: 'Sponsorane',
    winner: 'Vinnaren',
} as const;

export const FOZA_TEXT = {
    net: 'Mest Foza vunne',
    wins: 'Største gevinstar',
    empty: BOARD_TEXT.rette.empty,
    noWins: 'Ingen har vunne nokke enno. Nokken må jo vinna snart?',
};

/** Such as `3 av 5 rette`. */
export const correctLine = (correct: number, bets: number) => `${correct} av ${bets} rette`;

/** The title of the sponsor screen, the same words as on the strip. */
export const SPONSOR_LABEL = 'Stolt sponsa av';
export const NO_SPONSORS = 'Ingen sponsora enno. Lyst te å vera den fyrste?';
export const NO_FACTS = BOARD_TEXT.sigra.empty;


/** The line on the join chip of the other screens. It only shows with the big screen key. */
export const joinChip = (code: string) => `Bli med på /join · ${code}`;

/** The heading of the winner screen and the places under it. */
export const WINNER_TEXT = { title: 'Me har ein vinnar!', of: (tournament: string) => `Vinnaren av ${tournament}` };
export const placeName = (place: number) => `${place}. plass`;

/** The state of a match on the up next screen, such as `Sett 2 · 1–0 i sett · best av 3`. */
export function nextCaption(match: Pick<ScreenMatch, 'live' | 'bestOf' | 'sides'>): string {
    if (match.live) return `Sett ${match.live.game} · ${match.sides[0].sets}–${match.sides[1].sets} i sett · best av ${match.bestOf}`;
    return `Best av ${match.bestOf}`;
}
