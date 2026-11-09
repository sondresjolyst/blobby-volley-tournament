import { describe, expect, it } from 'vitest';
import { matchErrorMessage, parseChallengeAnswer, parseChallengeForm, parseCount, parseMatchForm, parseMatchIds } from './input';

describe('parseMatchForm', () => {
    it('reads the plain actions', () => {
        for (const action of ['call', 'restart', 'cancel', 'reset']) expect(parseMatchForm({ action })).toEqual({ action });
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

describe('parseChallengeForm', () => {
    it('reads the opponent and the settings, with 1, 15 and 75 for empty fields', () => {
        expect(parseChallengeForm({ opponent: '7', bestOf: '3', ruleFile: 'tennis.lua', scoreToWin: '21', speed: '100' })).toEqual({ opponentId: 7, bestOf: 3, ruleFile: 'tennis.lua', scoreToWin: 21, speed: 100 });
        expect(parseChallengeForm({ opponent: '7', bestOf: '', ruleFile: '', scoreToWin: ' ', speed: '' })).toEqual({ opponentId: 7, bestOf: 1, ruleFile: 'default.lua', scoreToWin: 15, speed: 75 });
        expect(parseChallengeForm({ opponent: '7' })).toEqual({ opponentId: 7, bestOf: 1, ruleFile: 'default.lua', scoreToWin: 15, speed: 75 });
    });

    it('takes only the rules the game ships', () => {
        for (const ruleFile of ['classic.lua', 'blitz.lua', 'one_hit_wonder.lua', 'jumping_jack.lua', 'back_defence.lua']) expect(parseChallengeForm({ opponent: '7', ruleFile })).toMatchObject({ ruleFile });
        for (const ruleFile of ['fun.lua', '../default.lua', 'default', 'TENNIS.lua']) expect(parseChallengeForm({ opponent: '7', ruleFile })).toBeNull();
    });

    it('keeps Brannmur below the points a report takes, and lets Lyn ignore the points', () => {
        expect(parseChallengeForm({ opponent: '7', ruleFile: 'firewall.lua', scoreToWin: '90' })).toMatchObject({ scoreToWin: 90 });
        expect(parseChallengeForm({ opponent: '7', ruleFile: 'firewall.lua', scoreToWin: '91' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', ruleFile: 'blitz.lua' })).toMatchObject({ ruleFile: 'blitz.lua', scoreToWin: 15 });
    });

    it('takes the bounds of the game', () => {
        expect(parseChallengeForm({ opponent: '7', scoreToWin: '1', speed: '30' })).toMatchObject({ scoreToWin: 1, speed: 30 });
        expect(parseChallengeForm({ opponent: '7', scoreToWin: '99', speed: '120' })).toMatchObject({ scoreToWin: 99, speed: 120 });
    });

    it('refuses a missing opponent and settings out of bounds', () => {
        expect(parseChallengeForm({})).toBeNull();
        expect(parseChallengeForm({ opponent: 'x' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', bestOf: '2' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', scoreToWin: '0' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', scoreToWin: '100' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', speed: '29' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', speed: '121' })).toBeNull();
        expect(parseChallengeForm({ opponent: '7', speed: '75.5' })).toBeNull();
    });
});

describe('parseChallengeAnswer', () => {
    it('reads accept, decline and withdraw only', () => {
        expect(parseChallengeAnswer({ answer: 'accept' })).toBe('accept');
        expect(parseChallengeAnswer({ answer: 'decline' })).toBe('decline');
        expect(parseChallengeAnswer({ answer: 'withdraw' })).toBe('withdraw');
        expect(parseChallengeAnswer({ answer: 'cancel' })).toBeNull();
        expect(parseChallengeAnswer({})).toBeNull();
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
