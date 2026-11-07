import { describe, expect, it } from 'vitest';
import { errorMessage } from '@/components/players/messages';
import { eventDates } from './text';

describe('eventDates', () => {
    it('names the month once for dates in the same month', () => {
        expect(eventDates('2026-11-20', '2026-11-22')).toBe('20. til 22. november 2026');
    });

    it('names both months across a month', () => {
        expect(eventDates('2026-11-30', '2026-12-02')).toBe('30. november til 2. desember 2026');
    });

    it('names both years across a year', () => {
        expect(eventDates('2026-12-30', '2027-01-01')).toBe('30. desember 2026 til 1. januar 2027');
    });

    it('shows one date for a one day event', () => {
        expect(eventDates('2026-11-20', '2026-11-20')).toBe('20. november 2026');
    });

    it('shows nothing for a date it cannot read', () => {
        expect(eventDates('nope', '2026-11-20')).toBe('');
    });
});

describe('errorMessage', () => {
    it('explains a wrong PIN in dialect', () => {
        expect(errorMessage('wrong')).toBe('Feil kallenavn eller PIN-kode.');
    });

    it('explains a failed GitHub sign-in', () => {
        expect(errorMessage('OAuthCallback')).toBe('Innlogginga med GitHub gjekk ikkje. Prøv igjen.');
    });

    it('shows nothing for an unknown code or a list', () => {
        expect(errorMessage('toString')).toBeNull();
        expect(errorMessage(['wrong'])).toBeNull();
        expect(errorMessage(undefined)).toBeNull();
    });

    it('never uses an em dash or a semicolon', () => {
        for (const code of ['no-event', 'code', 'taken', 'nickname-empty', 'nickname-too-long', 'nickname-invalid', 'pin', 'wrong', 'locked', 'busy', 'pins', 'sign-ups', 'form']) {
            const text = errorMessage(code);
            expect(text).toBeTruthy();
            expect(text).not.toMatch(/[\u2014;]/);
        }
    });
});
