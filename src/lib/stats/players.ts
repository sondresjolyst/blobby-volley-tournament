// Player stats from played matches. Forfeits and cancelled matches are left out, since no games
// were played in them.

/** A finished match that was played out, with the points of the games that count for the series. */
export interface PlayedMatch {
    matchId: number;
    tournamentId: number | null;
    players: [number, number];
    winnerId: number;
    /** The series score, games won by player 1 and player 2. */
    score: [number, number];
    /** The points of player 1 and player 2 in the games that count. */
    points: [number, number];
}

export interface HeadToHead {
    opponentId: number;
    won: number;
    lost: number;
}

export interface PlayerStats {
    playerId: number;
    matchesWon: number;
    matchesLost: number;
    gamesWon: number;
    gamesLost: number;
    /** Matches won as a share of matches played, from 0 to 1. Null before the first match. */
    winRate: number | null;
    pointsScored: number;
    pointsConceded: number;
    /** The most matches won in a row. */
    longestStreak: number;
    /** One row per opponent, the most played first. */
    headToHead: HeadToHead[];
}

const empty = (playerId: number) => ({
    playerId,
    matchesWon: 0,
    matchesLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsScored: 0,
    pointsConceded: 0,
    longestStreak: 0,
    streak: 0,
    opponents: new Map<number, HeadToHead>(),
});

/** Stats for every player in the matches, which must be in the order they were played. */
export function playerStats(matches: readonly PlayedMatch[]): Map<number, PlayerStats> {
    const all = new Map<number, ReturnType<typeof empty>>();
    const of = (id: number) => {
        let stats = all.get(id);
        if (!stats) all.set(id, (stats = empty(id)));
        return stats;
    };
    for (const match of matches) {
        for (const side of [0, 1] as const) {
            const me = of(match.players[side]);
            const other = 1 - side;
            const opponentId = match.players[other];
            const won = match.winnerId === match.players[side];
            if (won) me.matchesWon++;
            else me.matchesLost++;
            me.streak = won ? me.streak + 1 : 0;
            me.longestStreak = Math.max(me.longestStreak, me.streak);
            me.gamesWon += match.score[side];
            me.gamesLost += match.score[other];
            me.pointsScored += match.points[side];
            me.pointsConceded += match.points[other];
            const h2h = me.opponents.get(opponentId) ?? { opponentId, won: 0, lost: 0 };
            if (won) h2h.won++;
            else h2h.lost++;
            me.opponents.set(opponentId, h2h);
        }
    }
    return new Map(
        [...all].map(([id, s]) => {
            const played = s.matchesWon + s.matchesLost;
            const headToHead = [...s.opponents.values()].sort((a, b) => b.won + b.lost - (a.won + a.lost) || a.opponentId - b.opponentId);
            return [
                id,
                {
                    playerId: id,
                    matchesWon: s.matchesWon,
                    matchesLost: s.matchesLost,
                    gamesWon: s.gamesWon,
                    gamesLost: s.gamesLost,
                    winRate: played === 0 ? null : s.matchesWon / played,
                    pointsScored: s.pointsScored,
                    pointsConceded: s.pointsConceded,
                    longestStreak: s.longestStreak,
                    headToHead,
                },
            ];
        }),
    );
}

/** Most matches won first, then the best win rate, then the best game difference. */
export function compareWins(a: PlayerStats, b: PlayerStats): number {
    return b.matchesWon - a.matchesWon || (b.winRate ?? 0) - (a.winRate ?? 0) || b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost);
}
