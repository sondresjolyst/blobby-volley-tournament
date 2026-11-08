// The match state machine and series scoring. No database access, so it can be tested on its own.

export const MATCH_STATES = ['upcoming', 'called', 'started', 'finished', 'cancelled'] as const;
export type MatchState = (typeof MATCH_STATES)[number];

export function isMatchState(value: unknown): value is MatchState {
    return typeof value === 'string' && (MATCH_STATES as readonly string[]).includes(value);
}

/**
 * What can happen to a match.
 * - call: an admin tells the players of a tournament match to join. A 1v1 match is called when
 *   player 2 accepts it, or later when both players are free.
 * - start: the game server reports both players connected. Bets close here.
 * - finish: the series is decided.
 * - reopen: a correction leaves a finished series undecided again.
 * - forfeit: a player did not show up. The other player wins.
 * - cancel: an admin cancels a 1v1 match, or player 2 declines it. A tournament match is never
 *   cancelled, since the bracket could not move on. A no-show is used instead.
 * - reset: an admin sends a called, started or finished match back to upcoming and clears its games,
 *   so an earlier match can be corrected. Its bets are refunded.
 */
export type MatchAction = 'call' | 'start' | 'finish' | 'reopen' | 'forfeit' | 'cancel' | 'reset';

const TRANSITIONS: Readonly<Record<MatchAction, Partial<Record<MatchState, MatchState>>>> = {
    call: { upcoming: 'called' },
    start: { called: 'started' },
    finish: { started: 'finished' },
    reopen: { finished: 'started' },
    forfeit: { upcoming: 'finished', called: 'finished', started: 'finished' },
    cancel: { upcoming: 'cancelled', called: 'cancelled', started: 'cancelled' },
    reset: { called: 'upcoming', started: 'upcoming', finished: 'upcoming' },
};

/** The state after the action, or null when the action is not allowed in this state. */
export function nextState(from: MatchState, action: MatchAction): MatchState | null {
    return TRANSITIONS[action][from] ?? null;
}

export function canTransition(from: MatchState, action: MatchAction): boolean {
    return nextState(from, action) !== null;
}

/** How many games a player must win to take a best-of-N series. */
export function winsNeeded(bestOf: number): number {
    return Math.floor(bestOf / 2) + 1;
}

export interface GameResult {
    number: number;
    status: 'finished' | 'abandoned';
    winnerSlot: 1 | 2 | null;
}

export interface ManualScore {
    score1: number;
    score2: number;
    /** Games up to and including this number are replaced by the manual score. */
    afterGame: number;
}

export interface SeriesScore {
    score1: number;
    score2: number;
    /** The slot that won the series, or null while it is not decided. */
    winnerSlot: 1 | 2 | null;
}

/**
 * The series score from the games, in the order they were played. Abandoned games do not count.
 * A manual score replaces the games up to the game it was set after. Once a player has the wins
 * needed the series is decided, and any later game does not count.
 */
export function seriesScore(bestOf: number, games: readonly GameResult[], manual: ManualScore | null = null): SeriesScore {
    const needed = winsNeeded(bestOf);
    const score = [manual?.score1 ?? 0, manual?.score2 ?? 0];
    const decided = () => (score[0] >= needed ? 1 : score[1] >= needed ? 2 : null);
    const ordered = [...games].sort((a, b) => a.number - b.number);
    for (const game of ordered) {
        if (decided()) break;
        if (manual && game.number <= manual.afterGame) continue;
        if (game.status !== 'finished' || game.winnerSlot === null) continue;
        score[game.winnerSlot - 1]++;
    }
    return { score1: score[0], score2: score[1], winnerSlot: decided() };
}

/** True when a series score can be set by hand: neither above the wins needed and not both at it. */
export function isValidSeriesScore(bestOf: number, score1: number, score2: number): boolean {
    const needed = winsNeeded(bestOf);
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= needed;
    return ok(score1) && ok(score2) && !(score1 === needed && score2 === needed);
}

export interface BettableMatch {
    state: MatchState;
    tournamentId: number | null;
    acceptedAt: Date | null;
    players: [number | null, number | null];
}

/**
 * True while bets can be placed: both players are known, a 1v1 match is accepted, and the match
 * has not started. Bets close when the match starts.
 */
export function isOpenForBets(match: BettableMatch): boolean {
    if (match.state !== 'upcoming' && match.state !== 'called') return false;
    if (match.players[0] === null || match.players[1] === null) return false;
    return match.tournamentId !== null || match.acceptedAt !== null;
}
