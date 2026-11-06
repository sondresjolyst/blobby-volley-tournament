import { describe, expect, it } from 'vitest';
import { canTransition, isOpenForBets, isValidSeriesScore, MATCH_STATES, nextState, seriesScore, winsNeeded, type MatchAction, type MatchState } from './state';

const ALLOWED: [MatchState, MatchAction, MatchState][] = [
    ['upcoming', 'call', 'called'],
    ['called', 'start', 'started'],
    ['started', 'finish', 'finished'],
    ['finished', 'reopen', 'started'],
    ['upcoming', 'forfeit', 'finished'],
    ['called', 'forfeit', 'finished'],
    ['started', 'forfeit', 'finished'],
    ['upcoming', 'cancel', 'cancelled'],
    ['called', 'cancel', 'cancelled'],
    ['started', 'cancel', 'cancelled'],
    ['called', 'reset', 'upcoming'],
    ['started', 'reset', 'upcoming'],
    ['finished', 'reset', 'upcoming'],
];

const ACTIONS: MatchAction[] = ['call', 'start', 'finish', 'reopen', 'forfeit', 'cancel', 'reset'];

describe('match state machine', () => {
    it.each(ALLOWED)('allows %s to %s and goes to %s', (from, action, to) => {
        expect(nextState(from, action)).toBe(to);
        expect(canTransition(from, action)).toBe(true);
    });

    const refused = MATCH_STATES.flatMap((from) => ACTIONS.filter((action) => !ALLOWED.some(([f, a]) => f === from && a === action)).map((action) => [from, action] as const));

    it('refuses every other pair', () => {
        // Spelled out, so a new transition must be added here on purpose.
        expect(refused).toEqual([
            ['upcoming', 'start'],
            ['upcoming', 'finish'],
            ['upcoming', 'reopen'],
            ['upcoming', 'reset'],
            ['called', 'call'],
            ['called', 'finish'],
            ['called', 'reopen'],
            ['started', 'call'],
            ['started', 'start'],
            ['started', 'reopen'],
            ['finished', 'call'],
            ['finished', 'start'],
            ['finished', 'finish'],
            ['finished', 'forfeit'],
            ['finished', 'cancel'],
            ['cancelled', 'call'],
            ['cancelled', 'start'],
            ['cancelled', 'finish'],
            ['cancelled', 'reopen'],
            ['cancelled', 'forfeit'],
            ['cancelled', 'cancel'],
            ['cancelled', 'reset'],
        ]);
    });

    it.each(refused)('refuses %s to %s', (from, action) => {
        expect(nextState(from, action)).toBeNull();
        expect(canTransition(from, action)).toBe(false);
    });
});

describe('seriesScore', () => {
    const won = (number: number, winnerSlot: 1 | 2) => ({ number, status: 'finished' as const, winnerSlot });
    const abandoned = (number: number) => ({ number, status: 'abandoned' as const, winnerSlot: null });

    it.each([
        [1, 1],
        [3, 2],
        [5, 3],
        [7, 4],
    ])('best of %i needs %i wins', (bestOf, needed) => {
        expect(winsNeeded(bestOf)).toBe(needed);
    });

    it('decides best of 1 after one game', () => {
        expect(seriesScore(1, [won(1, 2)])).toEqual({ score1: 0, score2: 1, winnerSlot: 2 });
    });

    it('keeps best of 3 open at 1-1 and decides it at 2-1', () => {
        expect(seriesScore(3, [won(1, 1), won(2, 2)])).toEqual({ score1: 1, score2: 1, winnerSlot: null });
        expect(seriesScore(3, [won(1, 1), won(2, 2), won(3, 1)])).toEqual({ score1: 2, score2: 1, winnerSlot: 1 });
    });

    it('does not count abandoned games and reads games in played order', () => {
        expect(seriesScore(5, [won(4, 2), abandoned(2), won(1, 2), won(3, 1)])).toEqual({ score1: 1, score2: 2, winnerSlot: null });
    });

    it('ignores games after the series is decided', () => {
        expect(seriesScore(3, [won(1, 1), won(2, 1), won(3, 2)])).toEqual({ score1: 2, score2: 0, winnerSlot: 1 });
    });

    it('starts from a manual score and counts only later games', () => {
        const manual = { score1: 0, score2: 2, afterGame: 2 };
        expect(seriesScore(5, [won(1, 1), won(2, 1)], manual)).toEqual({ score1: 0, score2: 2, winnerSlot: null });
        expect(seriesScore(5, [won(1, 1), won(2, 1), won(3, 2)], manual)).toEqual({ score1: 0, score2: 3, winnerSlot: 2 });
        expect(seriesScore(3, [], { score1: 2, score2: 1, afterGame: 0 })).toEqual({ score1: 2, score2: 1, winnerSlot: 1 });
    });

    it('accepts a manual score up to the wins needed, not both at it', () => {
        expect(isValidSeriesScore(3, 1, 1)).toBe(true);
        expect(isValidSeriesScore(3, 2, 1)).toBe(true);
        expect(isValidSeriesScore(3, 2, 2)).toBe(false);
        expect(isValidSeriesScore(3, 3, 0)).toBe(false);
        expect(isValidSeriesScore(5, -1, 0)).toBe(false);
        expect(isValidSeriesScore(5, 1.5, 0)).toBe(false);
    });
});

describe('isOpenForBets', () => {
    const base = { state: 'upcoming' as MatchState, tournamentId: 1, acceptedAt: null, players: [1, 2] as [number | null, number | null] };

    it('is open for upcoming and called matches with both players', () => {
        expect(isOpenForBets(base)).toBe(true);
        expect(isOpenForBets({ ...base, state: 'called' })).toBe(true);
    });

    it.each(['started', 'finished', 'cancelled'] as const)('closes when the match is %s', (state) => {
        expect(isOpenForBets({ ...base, state })).toBe(false);
    });

    it('stays closed while a player is unknown or a 1v1 match is not accepted', () => {
        expect(isOpenForBets({ ...base, players: [1, null] })).toBe(false);
        expect(isOpenForBets({ ...base, tournamentId: null })).toBe(false);
        expect(isOpenForBets({ ...base, tournamentId: null, acceptedAt: new Date() })).toBe(true);
    });
});
