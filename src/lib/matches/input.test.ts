import { describe, expect, it } from 'vitest';
import { matchErrorMessage, parseCount, parseMatchForm, parseMatchIds } from './input';

describe('parseMatchForm', () => {
    it('reads the plain actions', () => {
        for (const action of ['call', 'restart', 'cancel']) expect(parseMatchForm({ action })).toEqual({ action });
    });

    it('reads a game result, with abandoned as no winner', () => {
        expect(parseMatchForm({ action: 'game', game: '2', winner: '1', points1: '15', points2: '9' })).toEqual({ action: 'game', game: 2, winnerSlot: 1, points1: 15, points2: 9 });
        expect(parseMatchForm({ action: 'game', game: '3', winner: 'abandoned', points1: '4', points2: '6' })).toEqual({ action: 'game', game: 3, winnerSlot: null, points1: 4, points2: 6 });
    });

    it('refuses a game result with a bad field', () => {
        expect(parseMatchForm({ action: 'game', game: '0', winner: '1', points1: '1', points2: '0' })).toBeNull();
        expect(parseMatchForm({ action: 'game', game: '1', winner: '3', points1: '1', points2: '0' })).toBeNull();
        expect(parseMatchForm({ action: 'game', game: '1', winner: '1', points1: '-1', points2: '0' })).toBeNull();
        expect(parseMatchForm({ action: 'game', game: '1', winner: '1', points1: '1' })).toBeNull();
    });

    it('reads a series score and a no-show', () => {
        expect(parseMatchForm({ action: 'score', score1: '1', score2: '2' })).toEqual({ action: 'score', score1: 1, score2: 2 });
        expect(parseMatchForm({ action: 'score', score1: '1', score2: 'x' })).toBeNull();
        expect(parseMatchForm({ action: 'no-show', absent: '2' })).toEqual({ action: 'no-show', absentSlot: 2 });
        expect(parseMatchForm({ action: 'no-show', absent: '0' })).toBeNull();
    });

    it('refuses an unknown action', () => {
        expect(parseMatchForm({ action: 'delete' })).toBeNull();
        expect(parseMatchForm({})).toBeNull();
    });
});

describe('form helpers', () => {
    it('reads counts from 0 to 1000 only', () => {
        expect(parseCount('0')).toBe(0);
        expect(parseCount('1000')).toBe(1000);
        expect(parseCount('1001')).toBeNull();
        expect(parseCount('1.5')).toBeNull();
        expect(parseCount(undefined)).toBeNull();
    });

    it('keeps each good match id once', () => {
        expect(parseMatchIds(['3', '1', '3', 'x', '0'])).toEqual([3, 1]);
    });

    it('shows text only for known error codes', () => {
        expect(matchErrorMessage('player-busy')).toMatch(/already in a called/);
        expect(matchErrorMessage('toString')).toBeNull();
        expect(matchErrorMessage(['state'])).toBeNull();
    });
});
