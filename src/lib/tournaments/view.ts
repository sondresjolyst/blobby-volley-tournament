import { roundName, type FormatId, type MatchLink, type Section } from '@/lib/bracket';

/** The match fields the bracket view needs. Planned and saved matches both have them. */
export interface ViewMatchInput {
    id: number;
    section: Section;
    round: number;
    position: number;
    bestOf: number;
    ruleFile: string;
    players: [number | null, number | null];
    winnerTo: MatchLink | null;
    loserTo: MatchLink | null;
}

export interface ViewMatch {
    /** Starts at 1 in play order. Shown as "Match 3". */
    number: number;
    slots: [string, string];
    winnerTo: string;
    loserTo: string;
}

export interface ViewRound {
    key: string;
    name: string;
    bestOf: number;
    ruleFile: string;
    matches: ViewMatch[];
}

/** Turns a bracket into plain text rows for the admin pages. */
export function describeBracket(format: FormatId, matches: readonly ViewMatchInput[], nameOf: (playerId: number) => string): ViewRound[] {
    const number = new Map(matches.map((m, i) => [m.id, i + 1]));
    const feeds = new Map<string, string>();
    for (const m of matches) {
        if (m.winnerTo) feeds.set(`${m.winnerTo.matchId}:${m.winnerTo.slot}`, `Winner of match ${number.get(m.id)}`);
        if (m.loserTo) feeds.set(`${m.loserTo.matchId}:${m.loserTo.slot}`, `Loser of match ${number.get(m.id)}`);
    }
    const lastRound = new Map<Section, number>();
    for (const m of matches) lastRound.set(m.section, Math.max(lastRound.get(m.section) ?? 0, m.round));
    const rounds: ViewRound[] = [];
    for (const m of matches) {
        const key = `${m.section}-${m.round}`;
        let round = rounds.find((r) => r.key === key);
        if (!round) {
            round = { key, name: roundName(format, m.section, m.round, lastRound.get(m.section)!), bestOf: m.bestOf, ruleFile: m.ruleFile, matches: [] };
            rounds.push(round);
        }
        const slot = (s: 0 | 1) => {
            const player = m.players[s];
            return player !== null ? nameOf(player) : (feeds.get(`${m.id}:${s + 1}`) ?? 'Empty');
        };
        const link = (to: MatchLink | null, none: string) => (to ? `Match ${number.get(to.matchId)}` : none);
        round.matches.push({
            number: number.get(m.id)!,
            slots: [slot(0), slot(1)],
            winnerTo: link(m.winnerTo, 'Champion'),
            loserTo: link(m.loserTo, 'Out'),
        });
    }
    return rounds;
}
