// The words of the big screen, in the same jokey Rogaland dialect as the player pages.
import type { BoardKey, ScreenDuel, ScreenDuelResult, ScreenMatch } from '@/lib/big-screen/view';
import type { MatchState } from '@/lib/matches/state';
import { BETS_OPEN, calledText, STATE_TAGS } from '@/lib/tournaments/board';
import { foza, matchSettings, payout } from '@/components/player/text';
import { SPONSORS_LABEL } from '@/components/site/text';
import { NO_LAN } from '@/lib/texts';

export const BOARD_TEXT: Record<BoardKey, { tab: string; title: string; empty: string }> = {
    foza: { tab: 'Mest Foza', title: 'Mest Foza vunne', empty: 'Ingen bets e avgjort ennå. Sats någe Foza på ein kamp, då!' },
    sigra: { tab: 'Flest seira', title: 'Flest seira', empty: 'Ingen kampa e ferdigspelt ennå. Det tar seg opp, sjå.' },
    elo: { tab: 'Elo', title: 'Elo-toppen', empty: 'Ingen spelara her ennå.' },
};

const PILL_STATE: Partial<Record<MatchState, string>> = { started: STATE_TAGS.started, upcoming: STATE_TAGS.upcoming.toUpperCase() };

/** The state and the round of a match for the pill and the tags, such as `LIVE` and `Semifinala, kamp 1`. */
export function matchPill(match: Pick<ScreenMatch, 'state' | 'label' | 'tournamentName'>): { state: string; label: string } {
    if (match.state === 'called') return { state: calledText(match.tournamentName !== null).tag.toUpperCase(), label: match.label };
    return { state: PILL_STATE[match.state] ?? '', label: match.label };
}

/** The points of the game being played, such as `11–8`. */
export const livePoints = (live: NonNullable<ScreenMatch['live']>) => `${live.points[0]}–${live.points[1]}`;

/** What one Foza on each side pays back, such as `1,33× / 4,00×`, or a note while nobody has bet. */
export function matchOdds(match: Pick<ScreenMatch, 'pool' | 'sides'>): string {
    if (match.pool <= 0) return 'Ingen bets ennå';
    return `${payout(match.sides[0].multiplier).replace('betale ', '')} / ${payout(match.sides[1].multiplier).replace('betale ', '')}`;
}

/** An address on the site for the TV, such as `julalan.no/join`, or only the path when the host is not known. */
export const siteAddress = (site: string | null, path: string) => `${site ?? ''}${path}`;

/** The line under the pool bar when nobody has bet yet. */
export function poolLine(match: Pick<ScreenMatch, 'open' | 'pool'>, site: string | null = null): string {
    if (match.pool > 0) return `${foza(match.pool)} i potten`;
    return match.open ? `Ingen har satsa ennå. Ka dåkke vente på? Sats på ${siteAddress(site, '/me')}!` : 'Ingen bets på denne. Stengt for betting.';
}

/** A series score in the bracket, or nothing before the match starts. */
export const slotScore = (score: number | null) => (score === null ? '' : String(score));

export const SIDE_NAMES = { main: 'Vinnarsidå', losers: 'Taparsidå' } as const;

/** The note under a round with matches left out, such as `+ 4 kampa te`. */
export const moreMatches = (n: number) => `+ ${n} ${n === 1 ? 'kamp' : 'kampa'} te`;

/** The line on the sign-up card, with or without the QR code. */
export const joinLine = (hasQr: boolean, site: string | null = null) => (hasQr ? 'Skann og bruk LAN-koden' : `Gå te ${siteAddress(site, '/join')} og bruk LAN-koden`);

/** A place on a leaderboard nobody has taken yet. */
export const FREE_PLACE = 'Ledig plass';

export const NO_MATCH = { title: 'Ingen kampa i ringen ennå', text: 'Admin varme opp ovnen. Sjekk topplistå så lenge.' };
export const NO_BRACKET = 'Ingen turneringa ennå.';
export const NO_EVENT = { title: NO_LAN, text: 'Finn fram pizzaen og vent litt. Skjermen vakne av seg sjøl.' };

/** The names of the screens, as their regions are labelled. */
export const SCREEN_LABELS = {
    bracket: 'Heile kampoppsettet',
    foza: 'Foza-toppen',
    next: 'Snart i ringen',
    duels: '1v1 og neste kampa',
    stats: 'Gjæve fakta',
    sponsors: 'Sponsorane',
    winner: 'Vinnaren',
} as const;

export const FOZA_TEXT = {
    net: BOARD_TEXT.foza.title,
    wins: 'Største gevinsta',
    empty: BOARD_TEXT.foza.empty,
    noWins: 'Ingen har vunne någe ennå. Någen må jo vinna snart?',
};

/** Such as `3 av 5 rette`. */
export const correctLine = (correct: number, bets: number) => `${correct} av ${bets} rette`;

/** The title of the sponsor screen, the same words as on the strip. */
export const SPONSOR_LABEL = SPONSORS_LABEL;
export const NO_SPONSORS = 'Ingen sponsora ennå. Lyst te å vera den første?';
export const NO_FACTS = BOARD_TEXT.sigra.empty;


/** The line on the join chip of the other screens. It only shows with the big screen key. */
export const joinChip = (code: string, site: string | null = null) => `Bli med på ${siteAddress(site, '/join')} · ${code}`;

/** The heading of the winner screen and the places under it. */
export const WINNER_TEXT = { title: 'Me har ein vinnar!', of: (tournament: string) => `Vinnaren av ${tournament}` };
export const placeName = (place: number) => `${place}. plass`;

/** The state of a match on the up next screen, such as `Sett 2 · 1–0 i sett · best av 3 · Tennis`. */
export function nextCaption(match: Pick<ScreenMatch, 'live' | 'bestOf' | 'rules' | 'sides'>): string {
    if (match.live) return `Sett ${match.live.game} · ${match.sides[0].sets}–${match.sides[1].sets} i sett · best av ${match.bestOf} · ${match.rules}`;
    return `Best av ${match.bestOf} · ${match.rules}`;
}

/** The words of the 1v1 screen. */
export const DUEL_TEXT = {
    live: '1v1 i ringen',
    done: 'Tidlegare kampa',
    coming: 'Neste i turneringa',
    noLive: (site: string | null) => `Ingen 1v1 i gang. Utfordra någen på ${siteAddress(site, '/me')}!`,
    noDone: 'Ingen 1v1 e ferdigspelt ennå.',
    noComing: 'Ingen turneringskampa på vei ennå.',
    empty: (site: string | null) => `Ingen 1v1 og ingen kampa på vei ennå. Utfordra någen på ${siteAddress(site, '/me')}, då!`,
    walkover: 'walkover',
};

/** The settings and the state of a 1v1 on the floor, such as `Sett 2 · 1–0 i sett · Best av 3 · først te 15 · 75 fps`. */
export function duelCaption(duel: Pick<ScreenDuel, 'live' | 'sides' | 'bestOf' | 'scoreToWin' | 'speed' | 'ruleFile'>): string {
    const settings = matchSettings(duel);
    return duel.live ? `Sett ${duel.live.game} · ${duel.sides[0].sets}–${duel.sides[1].sets} i sett · ${settings}` : settings;
}

/** The bets on a 1v1, such as `Åpent for betting · 120 Foza i potten · 1,50× / 3,00×`. Null when there is nothing to say. */
export function duelBets(duel: Pick<ScreenDuel, 'open' | 'pool' | 'sides'>): string | null {
    if (duel.open) return duel.pool > 0 ? `${BETS_OPEN} · ${foza(duel.pool)} i potten · ${matchOdds(duel)}` : `${BETS_OPEN} · ingen bets ennå`;
    return duel.pool > 0 ? `${foza(duel.pool)} i potten` : null;
}

/** The score of a finished 1v1, such as `2–1`, or `walkover`. */
export const duelResult = (result: Pick<ScreenDuelResult, 'result' | 'sides'>) => (result.result === 'forfeit' ? DUEL_TEXT.walkover : `${result.sides[0].sets}–${result.sides[1].sets}`);
