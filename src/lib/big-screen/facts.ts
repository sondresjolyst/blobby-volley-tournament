// The records of the stats screen, worked out from the stored results. No database access, so it
// can be tested on its own. A record that has nothing to go on is left out.
import { countedGames, nicknameOf, type PlayedSeries } from '@/lib/stats/players';
import type { Leaderboard } from '@/lib/store/stats';

export type { PlayedSeries } from '@/lib/stats/players';

export type FactKey = 'wins' | 'biggestWin' | 'comeback' | 'longest' | 'streak' | 'points';

export interface ScreenFact {
    key: FactKey;
    label: string;
    /** The record itself, such as `15–0` or `23 min`. */
    value: string;
    /** Who set it, such as `Blobfisk mot Skvett`. */
    who: string;
}

/** A match shorter than this was entered by hand after the fact, so its length says nothing. */
export const SHORTEST_TIMED_MATCH = 60;

const whole = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

/** Such as `23 min`, or `1 t 05 min` from an hour. */
export function matchLength(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} t ${String(minutes % 60).padStart(2, '0')} min`;
}

/** The first item with the highest score above 0. Earlier items win a tie. */
function best<T>(items: readonly T[], score: (item: T) => number): T | null {
    let top: T | null = null;
    let topScore = 0;
    for (const item of items) {
        const s = score(item);
        if (s > topScore) {
            top = item;
            topScore = s;
        }
    }
    return top;
}


/** The deepest hole the winner of a series came back from, in games, with the score at that point. */
export function comeback(series: PlayedSeries): { behind: number; at: [number, number]; end: [number, number] } | null {
    if (series.winnerId === null || series.manual !== null) return null;
    const winnerSlot = series.players[0] === series.winnerId ? 1 : 2;
    let won = 0;
    let lost = 0;
    let worst = { behind: 0, at: [0, 0] as [number, number] };
    for (const game of countedGames(series)) {
        if (game.winnerSlot === winnerSlot) won++;
        else lost++;
        if (lost - won > worst.behind) worst = { behind: lost - won, at: [won, lost] };
    }
    return worst.behind > 0 ? { ...worst, end: [won, lost] } : null;
}

/** The records of the event. Only those with something to show. */
export function screenFacts(leaderboard: Leaderboard, series: readonly PlayedSeries[]): ScreenFact[] {
    const name = nicknameOf(leaderboard.nicknames);
    const versus = (s: PlayedSeries, firstId: number) => {
        const other = s.players[0] === firstId ? s.players[1] : s.players[0];
        return `${name(firstId)} mot ${name(other)}`;
    };
    const facts: ScreenFact[] = [];

    const wins = leaderboard.wins[0];
    if (wins && wins.matchesWon > 0) facts.push({ key: 'wins', label: 'Flest seira', value: `${wins.matchesWon} ${wins.matchesWon === 1 ? 'seier' : 'seira'}`, who: name(wins.playerId) });

    const games = series.flatMap((s) => countedGames(s).filter((g) => g.points[0] !== g.points[1]).map((g) => ({ s, g })));
    const blowout = best(games, ({ g }) => Math.abs(g.points[0] - g.points[1]) * 1000 + Math.max(...g.points));
    if (blowout) {
        const { s, g } = blowout;
        const winner = g.winnerSlot === 1 ? s.players[0] : s.players[1];
        const [high, low] = g.winnerSlot === 1 ? g.points : [g.points[1], g.points[0]];
        facts.push({ key: 'biggestWin', label: 'Største seier i eit sett', value: `${high}–${low}`, who: versus(s, winner) });
    }

    const turned = series.map((s) => ({ s, c: comeback(s) })).filter((x) => x.c !== null);
    const turn = best(turned, ({ c }) => c!.behind);
    if (turn) {
        const { s, c } = turn;
        facts.push({ key: 'comeback', label: 'Største snuoperasjon', value: `${c!.at[0]}–${c!.at[1]} te ${c!.end[0]}–${c!.end[1]}`, who: versus(s, s.winnerId!) });
    }

    const long = best(
        series.filter((s) => s.winnerId !== null),
        (s) => (s.seconds !== null && s.seconds >= SHORTEST_TIMED_MATCH ? s.seconds : 0),
    );
    if (long) facts.push({ key: 'longest', label: 'Lengste kamp', value: matchLength(long.seconds!), who: versus(long, long.winnerId!) });

    const streak = best(leaderboard.wins, (w) => (w.longestStreak >= 2 ? w.longestStreak : 0));
    if (streak) facts.push({ key: 'streak', label: 'Lengste rekke', value: `${streak.longestStreak} ${streak.longestStreak === 1 ? 'seier' : 'seira'} på rad`, who: name(streak.playerId) });

    const scorer = best(leaderboard.wins, (w) => w.pointsScored);
    if (scorer) facts.push({ key: 'points', label: 'Flest poeng', value: `${whole.format(scorer.pointsScored)} poeng`, who: name(scorer.playerId) });

    return facts;
}
