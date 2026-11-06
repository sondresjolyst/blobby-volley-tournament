// Elo ratings. They are worked out again from the stored results each time they are read, so a
// corrected result changes every later rating in the right order.
import { DEFAULT_ELO } from '@/lib/bracket';

/** The rating of a player who has played no rated match yet. */
export const ELO_START = DEFAULT_ELO;

/** How far one match can move a rating. */
export const ELO_K = 32;

/** One finished match that was played out. Forfeits, no-shows and cancelled matches are never rated. */
export interface RatedMatch {
    matchId: number;
    eventId: number;
    tournamentId: number | null;
    /** The players as they are known across events, see ratingKey in the store. */
    winner: string;
    loser: string;
}

/** The chance that a player rated `rating` beats a player rated `opponent`, from 0 to 1. */
export function expectedScore(rating: number, opponent: number): number {
    return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** The points the winner gains. The loser loses the same. */
export function winnerGain(winnerRating: number, loserRating: number): number {
    return ELO_K * (1 - expectedScore(winnerRating, loserRating));
}

export interface EloReplay {
    /** The rating of every player after the last match. */
    ratings: Map<string, number>;
    /** What the winner gained in each match, in the order played. */
    gains: { match: RatedMatch; gain: number }[];
}

/** Plays the matches through in the given order, starting every player at ELO_START. */
export function replayElo(matches: readonly RatedMatch[]): EloReplay {
    const ratings = new Map<string, number>();
    const gains: EloReplay['gains'] = [];
    const rating = (key: string) => ratings.get(key) ?? ELO_START;
    for (const match of matches) {
        const gain = winnerGain(rating(match.winner), rating(match.loser));
        ratings.set(match.winner, rating(match.winner) + gain);
        ratings.set(match.loser, rating(match.loser) - gain);
        gains.push({ match, gain });
    }
    return { ratings, gains };
}

/** The sum of what each player gained or lost in the matches that pass the filter. */
export function eloChanges(replay: EloReplay, include: (match: RatedMatch) => boolean): Map<string, number> {
    const changes = new Map<string, number>();
    for (const { match, gain } of replay.gains) {
        if (!include(match)) continue;
        changes.set(match.winner, (changes.get(match.winner) ?? 0) + gain);
        changes.set(match.loser, (changes.get(match.loser) ?? 0) - gain);
    }
    return changes;
}

/** A rating as it is shown, a whole number. */
export const shownRating = (rating: number) => Math.round(rating);
