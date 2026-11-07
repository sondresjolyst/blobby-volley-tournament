import type { MatchGame, MatchSummary } from '@/lib/store/matches';

/** Such as `Friday cup, Final, match 1`, or `1v1` for a standalone match. */
export function matchTitle(match: MatchSummary): string {
    return match.tournamentName === null ? '1v1' : `${match.tournamentName}, ${match.roundLabel}`;
}

/** Both players, with a placeholder for a slot that is not filled yet. */
export function matchPlayers(match: MatchSummary): string {
    const name = (slot: 0 | 1) => match.players[slot]?.nickname ?? 'To be decided';
    return `${name(0)} vs ${name(1)}`;
}

/** The series score, and the winner and how the match ended when it is over. */
export function matchOutcome(match: MatchSummary): string {
    const score = `${match.score1}-${match.score2}`;
    if (match.state === 'cancelled') return match.cancelReason === 'declined' ? 'Declined' : match.cancelReason === 'withdrawn' ? 'Withdrawn' : 'Cancelled';
    if (match.state !== 'finished') return score;
    const winner = match.players.find((p) => p?.id === match.winnerId)?.nickname ?? '';
    return match.result === 'forfeit' ? `${winner} wins by no-show` : `${score}, ${winner} wins`;
}

/** Where an abandoned game stopped and who left, such as `Game 2 stopped at 7-9. Blob left.` */
export function stoppedGame(match: Pick<MatchSummary, 'players'>, game: Pick<MatchGame, 'number' | 'points1' | 'points2' | 'leftSlot'>): string {
    const stopped = `Game ${game.number} stopped at ${game.points1}-${game.points2}.`;
    if (game.leftSlot === null) return `${stopped} The game server did not say who left.`;
    return `${stopped} ${match.players[game.leftSlot - 1]?.nickname ?? `Player ${game.leftSlot}`} left.`;
}
