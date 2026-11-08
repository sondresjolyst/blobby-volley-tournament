// What the big screen shows, worked out from what the stores read. No database access, so it can be
// tested on its own. Everything here goes to a public page and a public JSON route, so it holds
// nicknames and numbers only.
import type { FormatId } from '@/lib/bracket';
import type { MatchState } from '@/lib/matches/state';
import { ELO_START, shownRating } from '@/lib/stats/elo';
import type { MatchPool } from '@/lib/store/bets';
import type { LiveScore } from '@/lib/store/game-server';
import type { MatchSummary } from '@/lib/store/matches';
import type { SponsorRow } from '@/lib/store/sponsors';
import type { Leaderboard } from '@/lib/store/stats';
import { signed } from '@/components/stats/format';
import { compareNet } from '@/lib/stats/betting';
import { nicknameOf } from '@/lib/stats/players';
import { boardRoundName, buildBoard, feedName, type BoardBracketMatch, type BoardRound, type BoardSection, type BoardSlot } from '@/lib/tournaments/board';
import { screenFacts, type PlayedSeries, type ScreenFact } from './facts';
import { DEFAULT_ROTATION, type ScreenRotation } from './screens';

/** How many players each leaderboard shows. */
export const BOARD_ROWS = 5;
/** How many matches show under the big one. */
export const OTHER_MATCHES = 3;
/** How many rounds of one side of a bracket show at once. */
export const BRACKET_ROUNDS = 4;
/** How many matches of one round show at once. */
export const ROUND_MATCHES = 4;
/** How many matches the up next screen lists. */
export const UP_NEXT = 8;
/** How many bettors the Foza screen ranks. */
export const FOZA_ROWS = 8;
/** How many of the biggest wins the Foza screen lists. */
export const FOZA_WINS = 5;

export interface ScreenSide {
    nickname: string;
    /** The shown Elo rating of the player in the event. */
    elo: number;
    /** Games won in the series. */
    sets: number;
    /** The Foza staked on this player. */
    stake: number;
    /** What one Foza on this player pays back. Null while nobody backs the player. */
    multiplier: number | null;
}

export interface ScreenMatch {
    matchId: number;
    state: MatchState;
    /** Such as `Semifinala, kamp 1`, or `1v1-utfordring`. */
    label: string;
    tournamentName: string | null;
    bestOf: number;
    /** The score of the game being played. Null when none has come in. */
    live: { game: number; points: [number, number] } | null;
    /** The Foza in the pool. */
    pool: number;
    open: boolean;
    sides: [ScreenSide, ScreenSide];
}

export interface ScreenSlot {
    name: string;
    score: number | null;
    outcome: 'won' | 'lost' | null;
}

export interface ScreenBracketMatch {
    matchId: number;
    state: MatchState;
    slots: [ScreenSlot, ScreenSlot];
}

export interface ScreenRound {
    key: string;
    name: string;
    matches: ScreenBracketMatch[];
    /** Matches of the round left out to keep the cards readable. */
    more: number;
}

export interface ScreenBracket {
    tournamentId: number;
    name: string;
    /** The side of a double elimination bracket on show. Null when the bracket has one side. */
    side: 'main' | 'losers' | null;
    rounds: ScreenRound[];
    /** The most matches in one shown round. The page sizes the cards by it. */
    rows: number;
}

/** One side of a bracket with every round, for the bracket screen. */
export interface ScreenBracketSection {
    key: 'main' | 'losers';
    rounds: ScreenRound[];
    /** The most matches in one round of the side. */
    rows: number;
}

/** The whole bracket, every round of every side. */
export interface ScreenFullBracket {
    tournamentId: number;
    name: string;
    /** Both players of a match share one line, since a round has many matches. */
    dense: boolean;
    sections: ScreenBracketSection[];
}

export interface ScreenFoza {
    /** The bettors with a settled bet, the most Foza won net first. */
    bettors: { nickname: string; net: number; correct: number; bets: number }[];
    /** The biggest single wins, one per bettor, the biggest first. `profit` is what came on top of the stake. */
    wins: { nickname: string; on: string; profit: number }[];
}

export interface ScreenWinner {
    tournamentId: number;
    tournamentName: string;
    champion: string;
    /** Second and third place. Two players share third place when there is no bronze final. */
    podium: { place: number; names: string[] }[];
    /** The match that decided it. Null after a no-show. */
    final: { round: string; sides: [{ name: string; score: number }, { name: string; score: number }] } | null;
}

export type BoardKey = 'foza' | 'sigra' | 'elo';

export interface ScreenBoard {
    key: BoardKey;
    rows: { rank: number; nickname: string; value: string }[];
}

export interface ScreenSponsor {
    id: number;
    name: string;
    src: string;
    width: number;
    height: number;
}

export interface BigScreenData {
    /** Null when no event is active. The page loads again when it changes. */
    eventId: number | null;
    eventName: string | null;
    /** The event code. Only set for a request with the big screen key, null otherwise. */
    eventCode: string | null;
    /** The match in the big box: the first live one, or else the next one to play. */
    featured: ScreenMatch | null;
    /** Other live matches first, then the next ones open for bets. */
    others: ScreenMatch[];
    bracket: ScreenBracket | null;
    boards: ScreenBoard[];
    sponsors: ScreenSponsor[];
    /** The screens the big screen takes turns on. The open page follows a change on its next refresh. */
    rotation: ScreenRotation;
    /** Every round of the bracket, for the bracket screen. */
    fullBracket: ScreenFullBracket | null;
    /** The matches on the floor, then the next ones to play. */
    upNext: ScreenMatch[];
    foza: ScreenFoza;
    /** The records of the event. Only those with something to show. */
    facts: ScreenFact[];
    /** The champion of a tournament. Null until a tournament has one. */
    winner: ScreenWinner | null;
}

export const EMPTY_SCREEN: BigScreenData = {
    eventId: null,
    eventName: null,
    eventCode: null,
    featured: null,
    others: [],
    bracket: null,
    boards: [],
    sponsors: [],
    rotation: DEFAULT_ROTATION,
    fullBracket: null,
    upNext: [],
    foza: { bettors: [], wins: [] },
    facts: [],
    winner: null,
};

export interface ScreenTournament {
    id: number;
    name: string;
    format: FormatId;
    matches: readonly BoardBracketMatch[];
}

export interface ScreenInput {
    event: { id: number; name: string };
    /** Every match of the event in play order. */
    matches: readonly MatchSummary[];
    pools: readonly MatchPool[];
    /** The live scores of the called and started matches. */
    live: readonly LiveScore[];
    /** The leaderboards of the whole event. */
    leaderboard: Leaderboard;
    tournament: ScreenTournament | null;
    sponsors: readonly SponsorRow[];
    /** The played series of the event, for the records. */
    series: readonly PlayedSeries[];
    rotation: ScreenRotation;
}

const STATE_ORDER: Partial<Record<MatchState, number>> = { started: 0, called: 1 };

/**
 * The matches on the floor, best first: started matches with a live score, then the other started
 * ones, then the called ones. Within each, play order.
 */
export function floorMatches(matches: readonly MatchSummary[], live: readonly LiveScore[]): MatchSummary[] {
    const scored = new Set(live.filter((l) => l.live !== null).map((l) => l.matchId));
    const rank = (m: MatchSummary) => STATE_ORDER[m.state]! * 2 + (scored.has(m.id) ? 0 : 1);
    return matches.filter((m) => m.state in STATE_ORDER && m.players[0] && m.players[1]).sort((a, b) => rank(a) - rank(b));
}

/**
 * The tournament the bracket shows. A wanted one of the event wins. Otherwise the tournament of the
 * first match on the floor, then the newest with a match left to play, then the newest.
 */
export function pickTournament(tournamentIds: readonly number[], matches: readonly MatchSummary[], live: readonly LiveScore[], wanted: number | null): number | null {
    if (wanted !== null && tournamentIds.includes(wanted)) return wanted;
    const floor = floorMatches(matches, live).find((m) => m.tournamentId !== null);
    if (floor) return floor.tournamentId;
    const open = tournamentIds.find((id) => matches.some((m) => m.tournamentId === id && (m.state === 'upcoming' || m.state === 'called' || m.state === 'started')));
    return open ?? tournamentIds[0] ?? null;
}

function label(match: MatchSummary): string {
    const round = match.bracketRound;
    if (round === null) return '1v1-utfordring';
    return `${boardRoundName(round.format, round.section, round.round, round.lastRound)}, kamp ${round.position}`;
}

function screenMatch(match: MatchSummary, pool: MatchPool | undefined, live: LiveScore | undefined, elo: ReadonlyMap<number, number>): ScreenMatch {
    const side = (slot: 0 | 1): ScreenSide => {
        const player = match.players[slot]!;
        const odds = pool?.sides.find((s) => s.playerId === player.id);
        return {
            nickname: player.nickname,
            elo: shownRating(elo.get(player.id) ?? ELO_START),
            sets: slot === 0 ? match.score1 : match.score2,
            stake: odds?.stake ?? 0,
            multiplier: odds?.multiplier ?? null,
        };
    };
    return {
        matchId: match.id,
        state: match.state,
        label: label(match),
        tournamentName: match.tournamentName,
        bestOf: match.bestOf,
        live: live?.live ? { game: live.live.game, points: [live.live.points[0].points, live.live.points[1].points] } : null,
        pool: pool?.total ?? 0,
        open: pool?.open ?? false,
        sides: [side(0), side(1)],
    };
}

/** Shows at most `max` rounds, from the first one with a match left to play, so the action stays in view. */
export function roundWindow<T extends { matches: readonly { state: MatchState }[] }>(rounds: readonly T[], max = BRACKET_ROUNDS): T[] {
    const first = rounds.findIndex((r) => r.matches.some((m) => m.state !== 'finished' && m.state !== 'cancelled'));
    const start = Math.max(0, Math.min(first === -1 ? rounds.length : first, rounds.length - max));
    return rounds.slice(start, start + max);
}

const FOCUS: Record<MatchState, number> = { started: 0, called: 1, upcoming: 2, finished: 3, cancelled: 4 };

/**
 * Keeps at most `max` matches of a round: live and called ones first, then the ones still to play,
 * then the rest. They stay in bracket order.
 */
export function focusMatches<T extends { state: MatchState }>(matches: readonly T[], max = ROUND_MATCHES): T[] {
    const keep = new Set(
        matches
            .map((m, i) => ({ m, i }))
            .sort((a, b) => FOCUS[a.m.state] - FOCUS[b.m.state] || a.i - b.i)
            .slice(0, max)
            .map((x) => x.i),
    );
    return matches.filter((_, i) => keep.has(i));
}

/** The side of a double elimination bracket on show: the losers side once only it has matches on the floor or left to play. */
export function pickSide<T extends { key: 'main' | 'losers'; rounds: readonly { matches: readonly { state: MatchState }[] }[] }>(sections: readonly T[]): T {
    const busy = (s: T, states: readonly MatchState[]) => s.rounds.some((r) => r.matches.some((m) => states.includes(m.state)));
    const [main, losers] = sections;
    if (!losers) return main;
    for (const states of [['started'], ['called'], ['upcoming']] as const) {
        if (busy(main, states)) return main;
        if (busy(losers, states)) return losers;
    }
    return main;
}

/**
 * A round of the bracket with at most `max` of its matches. `short` writes an empty slot as
 * `Vinnar k. 3`, so it fits where both players share a line.
 */
function screenRound(round: BoardRound, max: number, short = false): ScreenRound {
    const slot = (s: BoardSlot): ScreenSlot => ({ name: s.feed ? feedName(s.feed, short) : s.name, score: s.score, outcome: s.outcome });
    return {
        key: round.key,
        name: round.name,
        more: Math.max(0, round.matches.length - max),
        matches: focusMatches(round.matches, max).map((m) => ({ matchId: m.matchId, state: m.state, slots: [slot(m.slots[0]), slot(m.slots[1])] })),
    };
}

const mostRows = (rounds: readonly ScreenRound[]) => Math.max(1, ...rounds.map((r) => r.matches.length));

/** The bracket of the tournament with the state of each match, laid out once for both bracket views. */
function bracketSections(tournament: ScreenTournament, matches: readonly MatchSummary[]): BoardSection[] {
    const own = matches.filter((m) => m.tournamentId === tournament.id);
    return buildBoard(tournament.format, tournament.matches, own, null, new Set());
}

function screenBracket(tournament: ScreenTournament, sections: readonly BoardSection[]): ScreenBracket {
    const section = pickSide(sections);
    const rounds = roundWindow(section.rounds).map((round) => screenRound(round, ROUND_MATCHES));
    return { tournamentId: tournament.id, name: tournament.name, side: sections.length > 1 ? section.key : null, rounds, rows: mostRows(rounds) };
}

/** From this many matches in a round, the bracket screen puts both players of a match on one line. */
export const DENSE_ROWS = 4;

/** Every round of every side of the bracket. A big bracket names empty slots short, since it is dense. */
export function fullBracket(tournament: ScreenTournament, sections: readonly BoardSection[]): ScreenFullBracket {
    const dense = sections.some((section) => section.rounds.some((round) => round.matches.length > DENSE_ROWS));
    return {
        tournamentId: tournament.id,
        name: tournament.name,
        dense,
        sections: sections.map((section) => {
            const rounds = section.rounds.map((round) => screenRound(round, round.matches.length, dense));
            return { key: section.key, rounds, rows: mostRows(rounds) };
        }),
    };
}

/**
 * The matches on the floor, then the next ones to call, at most UP_NEXT. There is no schedule, so
 * the next ones come in the order of the match list: tournament matches in bracket order, and 1v1
 * matches in the order they were made. A match needs both players, and a 1v1 match must be
 * accepted, since it cannot be called before that.
 */
export function upNextMatches(matches: readonly MatchSummary[], live: readonly LiveScore[]): MatchSummary[] {
    const next = matches.filter((m) => m.state === 'upcoming' && m.players[0] && m.players[1] && (m.tournamentId !== null || m.acceptedAt !== null));
    return [...floorMatches(matches, live), ...next].slice(0, UP_NEXT);
}

/** The best bettors by Foza won net, and the biggest single wins, one per bettor. */
export function screenFoza(leaderboard: Leaderboard): ScreenFoza {
    const name = nicknameOf(leaderboard.nicknames);
    const bettors = [...leaderboard.bettors]
        .sort(compareNet)
        .slice(0, FOZA_ROWS)
        .map((b) => ({ nickname: name(b.playerId), net: b.net, correct: b.correct, bets: b.bets }));
    const wins = leaderboard.bettors
        .filter((b) => b.biggestWin !== null && b.biggestWin.value > 0)
        .sort((a, b) => b.biggestWin!.value - a.biggestWin!.value)
        .slice(0, FOZA_WINS)
        .map((b) => ({ nickname: name(b.playerId), on: name(b.biggestWin!.onPlayerId), profit: b.biggestWin!.value }));
    return { bettors, wins };
}

/**
 * The champion to show: of the tournament on screen when it has one, otherwise of the newest
 * tournament that has one. Null while no tournament of the event is decided.
 */
export function screenWinner(leaderboard: Leaderboard, matches: readonly MatchSummary[], shownTournamentId: number | null): ScreenWinner | null {
    const champions = leaderboard.placings.filter((p) => p.place === 1);
    const champion = champions.find((p) => p.tournamentId === shownTournamentId) ?? [...champions].sort((a, b) => b.tournamentId - a.tournamentId)[0];
    if (!champion) return null;
    const name = nicknameOf(leaderboard.nicknames);
    const placed = leaderboard.placings.filter((p) => p.tournamentId === champion.tournamentId);
    const podium = [2, 3]
        .map((place) => ({ place, names: placed.filter((p) => p.place === place).map((p) => name(p.playerId)) }))
        .filter((p) => p.names.length > 0);
    // The final is the won match of the champion in the last stage: the grand final, else the last round of the winners side.
    const stage = (m: MatchSummary) => (m.bracketRound!.section === 'final' ? 1_000 : 0) + m.bracketRound!.round;
    const won = matches.filter((m) => m.tournamentId === champion.tournamentId && m.state === 'finished' && m.winnerId === champion.playerId && m.bracketRound !== null);
    const last = won.reduce<MatchSummary | null>((top, m) => (top === null || stage(m) >= stage(top) ? m : top), null);
    const decider = last?.result === 'played' ? last : null;
    const round = decider?.bracketRound;
    const final: ScreenWinner['final'] =
        decider && round
            ? {
                  round: boardRoundName(round.format, round.section, round.round, round.lastRound),
                  sides: [
                      { name: decider.players[0]?.nickname ?? '', score: decider.score1 },
                      { name: decider.players[1]?.nickname ?? '', score: decider.score2 },
                  ],
              }
            : null;
    return { tournamentId: champion.tournamentId, tournamentName: champion.tournamentName, champion: name(champion.playerId), podium, final };
}

/** The three leaderboards, top five each. Bettors are ranked by Foza won net, the same as on the Foza screen. */
export function screenBoards(leaderboard: Leaderboard): ScreenBoard[] {
    const name = nicknameOf(leaderboard.nicknames);
    const top = <T>(list: readonly T[], row: (item: T) => { id: number; value: string }) =>
        list.slice(0, BOARD_ROWS).map((item, i) => {
            const { id, value } = row(item);
            return { rank: i + 1, nickname: name(id), value };
        });
    return [
        { key: 'foza', rows: top([...leaderboard.bettors].sort(compareNet), (b) => ({ id: b.playerId, value: signed(b.net) })) },
        { key: 'sigra', rows: top(leaderboard.wins, (s) => ({ id: s.playerId, value: `${s.matchesWon} ${s.matchesWon === 1 ? 'siger' : 'sigra'}` })) },
        { key: 'elo', rows: top(leaderboard.elo, (e) => ({ id: e.playerId, value: String(shownRating(e.rating)) })) },
    ];
}

/** Everything the big screen shows for the active event. */
export function buildBigScreen(input: ScreenInput): BigScreenData {
    const elo = new Map(input.leaderboard.elo.map((e) => [e.playerId, e.rating]));
    const pools = new Map(input.pools.map((p) => [p.matchId, p]));
    const live = new Map(input.live.map((l) => [l.matchId, l]));
    const show = (m: MatchSummary) => screenMatch(m, pools.get(m.id), live.get(m.id), elo);
    const floor = floorMatches(input.matches, input.live).map(show);
    const next = input.matches.filter((m) => m.state === 'upcoming' && pools.get(m.id)?.open).map(show);
    const [featured = null, ...others] = [...floor, ...next];
    const sections = input.tournament ? bracketSections(input.tournament, input.matches) : null;
    return {
        eventId: input.event.id,
        eventName: input.event.name,
        eventCode: null,
        featured,
        others: others.slice(0, OTHER_MATCHES),
        bracket: input.tournament && sections ? screenBracket(input.tournament, sections) : null,
        boards: screenBoards(input.leaderboard),
        sponsors: input.sponsors.map((s) => ({ id: s.id, name: s.name, src: `/api/sponsors/${s.id}/logo?v=${s.logoHash}`, width: s.logoWidth, height: s.logoHeight })),
        rotation: input.rotation,
        fullBracket: input.tournament && sections ? fullBracket(input.tournament, sections) : null,
        upNext: upNextMatches(input.matches, input.live).map(show),
        foza: screenFoza(input.leaderboard),
        facts: screenFacts(input.leaderboard, input.series),
        winner: screenWinner(input.leaderboard, input.matches, input.tournament?.id ?? null),
    };
}
