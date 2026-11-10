// The bracket as the players see it, in the words of the player pages. No database access, so it
// can be tested on its own.
import type { FormatId, MatchLink, Section } from '@/lib/bracket';
import type { MatchState } from '@/lib/matches/state';

/** The name of a round on the player pages, such as `Semifinala` or `Taparrunde 2`. */
export function boardRoundName(format: FormatId, section: Section, round: number, lastRound: number): string {
    if (section === 'final') return 'Storfinale';
    if (section === 'third_place') return 'Bronsefinale';
    if (section === 'losers') return round === lastRound ? 'Taparfinale' : `Taparrunde ${round}`;
    if (format === 'double_elimination') return round === lastRound ? 'Vinnarfinale' : `Vinnarrunde ${round}`;
    if (round === lastRound) return 'Finale';
    if (round === lastRound - 1) return 'Semifinala';
    if (round === lastRound - 2) return 'Kvartfinala';
    return `Runde ${round}`;
}

/** The fields of a bracket match the board needs. A saved tournament has them. */
export interface BoardBracketMatch {
    id: number;
    section: Section;
    round: number;
    position: number;
    bestOf: number;
    ruleFile: string;
    winnerTo: MatchLink | null;
    loserTo: MatchLink | null;
}

/** The fields of a played match the board needs. A match summary has them. */
export interface BoardRuntimeMatch {
    id: number;
    bracketMatchId: number | null;
    state: MatchState;
    players: [{ id: number; nickname: string } | null, { id: number; nickname: string } | null];
    score1: number;
    score2: number;
    winnerId: number | null;
    result: 'played' | 'forfeit' | null;
}

/** Where a player of a later match comes from: the winner or the loser of an earlier match, by its number. */
export interface Feed {
    from: 'winner' | 'loser';
    match: number;
}

/** A feed in words, such as `Vinnar av kamp 3`, or `Vinnar k. 3` short. */
export function feedName(feed: Feed, short = false): string {
    const who = feed.from === 'winner' ? 'Vinnar' : 'Tapar';
    return short ? `${who} k. ${feed.match}` : `${who} av kamp ${feed.match}`;
}

export interface BoardSlot {
    /** The nickname, or where the player comes from, such as `Vinnar av kamp 3`. */
    name: string;
    playerId: number | null;
    /** Where the player comes from while the slot is empty. Null once the player is known, or when nothing feeds the slot. */
    feed: Feed | null;
    /** The series score once the match has started. Null before that and after a no-show. */
    score: number | null;
    outcome: 'won' | 'lost' | null;
    /** The player who looks at the page. */
    mine: boolean;
}

export interface BoardMatch {
    /** The match row. Bets and links use it. */
    matchId: number;
    /** Starts at 1 in play order, as on the admin pages. */
    number: number;
    state: MatchState;
    status: string;
    slots: [BoardSlot, BoardSlot];
    /** The player who looks at the page plays in it. */
    mine: boolean;
    openForBets: boolean;
}

export interface BoardRound {
    key: string;
    name: string;
    bestOf: number;
    ruleFile: string;
    matches: BoardMatch[];
}

export interface BoardSection {
    /** `main` holds the winners rounds and the finals. `losers` is the losers bracket of double elimination. */
    key: 'main' | 'losers';
    rounds: BoardRound[];
}

/**
 * The words for a called match. An admin calls a tournament match up. The players run a 1v1 match
 * themselves, so nobody calls it up, it is only ready.
 */
export const CALLED_TEXT = {
    tournament: { tag: 'Ropt opp', heading: 'Kampen din e ropt opp!' },
    oneVsOne: { tag: 'Klar', heading: 'Kampen din e klar!' },
} as const;

/** The called words for a tournament match or a 1v1 match. */
export const calledText = (inTournament: boolean) => CALLED_TEXT[inTournament ? 'tournament' : 'oneVsOne'];

/** The tag of a match that takes bets. */
export const BETS_OPEN = 'Spelå e åpne';

/** The state tags of the bracket, which only holds tournament matches. */
export const STATE_TAGS: Record<MatchState, string> = {
    upcoming: 'Snart',
    called: CALLED_TEXT.tournament.tag,
    started: 'LIVE',
    finished: 'Ferdig',
    cancelled: 'Avlyst',
};

const SECTION_ORDER: readonly Section[] = ['winners', 'third_place', 'final'];

/**
 * Lays out a saved bracket with the state of each match. The rounds of the winners bracket come
 * first, then the third place match and the grand final. The losers bracket is its own section.
 */
export function buildBoard(
    format: FormatId,
    bracket: readonly BoardBracketMatch[],
    runtime: readonly BoardRuntimeMatch[],
    viewerId: number | null,
    openMatchIds: ReadonlySet<number>,
): BoardSection[] {
    const number = new Map(bracket.map((m, i) => [m.id, i + 1]));
    const feeds = new Map<string, Feed>();
    for (const m of bracket) {
        if (m.winnerTo) feeds.set(`${m.winnerTo.matchId}:${m.winnerTo.slot}`, { from: 'winner', match: number.get(m.id)! });
        if (m.loserTo) feeds.set(`${m.loserTo.matchId}:${m.loserTo.slot}`, { from: 'loser', match: number.get(m.id)! });
    }
    const lastRound = new Map<Section, number>();
    for (const m of bracket) lastRound.set(m.section, Math.max(lastRound.get(m.section) ?? 0, m.round));
    const byBracket = new Map(runtime.filter((r) => r.bracketMatchId !== null).map((r) => [r.bracketMatchId!, r]));

    const rounds = new Map<string, BoardRound & { section: Section }>();
    for (const m of bracket) {
        const played = byBracket.get(m.id);
        if (!played) continue;
        const key = `${m.section}-${m.round}`;
        let round = rounds.get(key);
        if (!round) {
            round = { key, section: m.section, name: boardRoundName(format, m.section, m.round, lastRound.get(m.section)!), bestOf: m.bestOf, ruleFile: m.ruleFile, matches: [] };
            rounds.set(key, round);
        }
        const showScore = played.result !== 'forfeit' && (played.state === 'started' || played.state === 'finished');
        const slot = (s: 0 | 1): BoardSlot => {
            const player = played.players[s];
            const feed = player ? null : (feeds.get(`${m.id}:${s + 1}`) ?? null);
            return {
                name: player?.nickname ?? (feed ? feedName(feed) : 'Fri'),
                playerId: player?.id ?? null,
                feed,
                score: showScore ? (s === 0 ? played.score1 : played.score2) : null,
                outcome: played.state === 'finished' && player !== null ? (played.winnerId === player.id ? 'won' : 'lost') : null,
                mine: player !== null && player.id === viewerId,
            };
        };
        const slots: [BoardSlot, BoardSlot] = [slot(0), slot(1)];
        round.matches.push({
            matchId: played.id,
            number: number.get(m.id)!,
            state: played.state,
            status: played.result === 'forfeit' ? 'Walkover' : STATE_TAGS[played.state],
            slots,
            mine: slots.some((s) => s.mine),
            openForBets: openMatchIds.has(played.id),
        });
    }

    const all = [...rounds.values()];
    const strip = (r: BoardRound): BoardRound => ({ key: r.key, name: r.name, bestOf: r.bestOf, ruleFile: r.ruleFile, matches: r.matches });
    const main = SECTION_ORDER.flatMap((section) => all.filter((r) => r.section === section)).map(strip);
    const losers = all.filter((r) => r.section === 'losers').map(strip);
    return losers.length > 0 ? [{ key: 'main', rounds: main }, { key: 'losers', rounds: losers }] : [{ key: 'main', rounds: main }];
}
