import { roundName } from '@/lib/bracket';
import type { MatchGame, MatchSummary } from '@/lib/store/matches';
import { boardRoundName } from '@/lib/tournaments/board';
import { NOT_DECIDED } from '@/lib/texts';

/** Who reads the text: admins in English, or players in the Rogaland dialect of the LAN. */
export type Reader = 'admin' | 'player';

const WORDS = {
    admin: { oneVsOne: '1v1', separator: ', ', match: 'match', open: 'To be decided', round: roundName },
    player: { oneVsOne: '1v1', separator: ' · ', match: 'kamp', open: NOT_DECIDED, round: boardRoundName },
} as const;

/**
 * Such as `Friday cup, Final, match 1` for an admin or `Hovedcupen · Semifinala, kamp 1` for a
 * player. A standalone match is `1v1` for both.
 */
export function matchTitle(match: Pick<MatchSummary, 'tournamentName' | 'bracketRound'>, reader: Reader): string {
    const words = WORDS[reader];
    const round = match.bracketRound;
    if (match.tournamentName === null || round === null) return words.oneVsOne;
    return `${match.tournamentName}${words.separator}${words.round(round.format, round.section, round.round, round.lastRound)}, ${words.match} ${round.position}`;
}

/** Both players, with a placeholder for a slot that is not filled yet. */
export function matchPlayers(match: Pick<MatchSummary, 'players'>, reader: Reader): string {
    const name = (slot: 0 | 1) => match.players[slot]?.nickname ?? WORDS[reader].open;
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

/** Where an abandoned game stopped and who left, such as `Game 2 abandoned at 7-9. Blob left.` */
export function stoppedGame(match: Pick<MatchSummary, 'players'>, game: Pick<MatchGame, 'number' | 'points1' | 'points2' | 'leftSlot'>): string {
    const stopped = `Game ${game.number} abandoned at ${game.points1}-${game.points2}.`;
    if (game.leftSlot === null) return `${stopped} The game server did not say who left.`;
    return `${stopped} ${match.players[game.leftSlot - 1]?.nickname ?? `Player ${game.leftSlot}`} left.`;
}
