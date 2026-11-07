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
import { boardRoundName, buildBoard, type BoardBracketMatch } from '@/lib/tournaments/board';

/** How many players each leaderboard shows. */
export const BOARD_ROWS = 5;
/** How many matches show under the big one. */
export const OTHER_MATCHES = 3;
/** How many rounds of one side of a bracket show at once. */
export const BRACKET_ROUNDS = 4;
/** How many matches of one round show at once. */
export const ROUND_MATCHES = 4;

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

export type BoardKey = 'rette' | 'sigra' | 'elo';

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
}

export const EMPTY_SCREEN: BigScreenData = { eventId: null, eventName: null, eventCode: null, featured: null, others: [], bracket: null, boards: [], sponsors: [] };

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

function screenBracket(tournament: ScreenTournament, matches: readonly MatchSummary[]): ScreenBracket {
    const own = matches.filter((m) => m.tournamentId === tournament.id);
    const sections = buildBoard(tournament.format, tournament.matches, own, null, new Set());
    const section = pickSide(sections);
    const rounds = roundWindow(section.rounds).map((round) => ({
        key: round.key,
        name: round.name,
        more: Math.max(0, round.matches.length - ROUND_MATCHES),
        matches: focusMatches(round.matches).map((m) => ({
            matchId: m.matchId,
            state: m.state,
            slots: [
                { name: m.slots[0].name, score: m.slots[0].score, outcome: m.slots[0].outcome },
                { name: m.slots[1].name, score: m.slots[1].score, outcome: m.slots[1].outcome },
            ] as [ScreenSlot, ScreenSlot],
        })),
    }));
    const rows = Math.max(1, ...rounds.map((r) => r.matches.length));
    return { tournamentId: tournament.id, name: tournament.name, side: sections.length > 1 ? section.key : null, rounds, rows };
}

/** The three leaderboards, top five each. Bets are ranked by correct bets, not by Foza held. */
export function screenBoards(leaderboard: Leaderboard): ScreenBoard[] {
    const name = (id: number) => leaderboard.nicknames.get(id) ?? `Spelar ${id}`;
    const top = <T>(list: readonly T[], row: (item: T) => { id: number; value: string }) =>
        list.slice(0, BOARD_ROWS).map((item, i) => {
            const { id, value } = row(item);
            return { rank: i + 1, nickname: name(id), value };
        });
    return [
        { key: 'rette', rows: top(leaderboard.bettors, (b) => ({ id: b.playerId, value: `${b.correct} av ${b.bets}` })) },
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
    return {
        eventId: input.event.id,
        eventName: input.event.name,
        eventCode: null,
        featured,
        others: others.slice(0, OTHER_MATCHES),
        bracket: input.tournament ? screenBracket(input.tournament, input.matches) : null,
        boards: screenBoards(input.leaderboard),
        sponsors: input.sponsors.map((s) => ({ id: s.id, name: s.name, src: `/api/sponsors/${s.id}/logo?v=${s.logoHash}`, width: s.logoWidth, height: s.logoHeight })),
    };
}
