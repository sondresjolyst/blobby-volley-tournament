import { describe, expect, it } from 'vitest';
import { betErrorMessage, parseAdjustmentForm, parseBetForm, parseFoza } from './input';

describe('parseFoza', () => {
    it.each([
        ['1', 1],
        [' 250 ', 250],
        ['1000000', 1_000_000],
    ])('reads %j as %i', (value, expected) => {
        expect(parseFoza(value)).toBe(expected);
    });

    it.each([undefined, '', '0', '-1', '1.5', '01', '1e3', '1000001', 'ten'])('refuses %j', (value) => {
        expect(parseFoza(value)).toBeNull();
    });
});

describe('parseBetForm', () => {
    it('reads the match, the backed player and the amount', () => {
        expect(parseBetForm({ matchId: '7', on: '3', amount: '50' })).toEqual({ matchId: 7, onPlayerId: 3, amount: 50 });
    });

    it('refuses a form with a field missing or wrong', () => {
        expect(parseBetForm({ matchId: '7', on: '3' })).toBeNull();
        expect(parseBetForm({ matchId: 'x', on: '3', amount: '5' })).toBeNull();
        expect(parseBetForm({ matchId: '7', on: '0', amount: '5' })).toBeNull();
    });
});

describe('parseAdjustmentForm', () => {
    it('reads a signed amount and a trimmed reason', () => {
        expect(parseAdjustmentForm({ amount: '+200', reason: ' Won the quiz ' })).toEqual({ amount: 200, reason: 'Won the quiz' });
        expect(parseAdjustmentForm({ amount: '-50', reason: 'Typo' })).toEqual({ amount: -50, reason: 'Typo' });
    });

    it('refuses 0, a missing reason and a reason over 200 characters', () => {
        expect(parseAdjustmentForm({ amount: '0', reason: 'x' })).toBeNull();
        expect(parseAdjustmentForm({ amount: '10', reason: '  ' })).toBeNull();
        expect(parseAdjustmentForm({ amount: '10', reason: 'x'.repeat(201) })).toBeNull();
    });
});

describe('betErrorMessage', () => {
    it('has a text for known codes only', () => {
        expect(betErrorMessage('closed')).toBe('Spelå på den kampen e stengt. Kampen har starta eller e ferdig.');
        expect(betErrorMessage('constructor')).toBeNull();
        expect(betErrorMessage(undefined)).toBeNull();
    });
});
