import { describe, expect, it } from 'vitest';
import { joinLine, matchPill, poolLine, slotScore } from './text';

describe('big screen text', () => {
    it('names the state of a match for the pill', () => {
        expect(matchPill({ state: 'started', label: 'Semifinala, kamp 1' })).toEqual({ state: 'LIVE', label: 'Semifinala, kamp 1' });
        expect(matchPill({ state: 'called', label: '1v1-utfordring' }).state).toBe('ROPT OPP');
        expect(matchPill({ state: 'upcoming', label: 'Finale, kamp 1' }).state).toBe('SNART');
    });

    it('says whether bets can still be placed when the pool is empty', () => {
        expect(poolLine({ open: true, pool: 0 })).toContain('Sats på /me');
        expect(poolLine({ open: false, pool: 0 })).toContain('stengt');
        expect(poolLine({ open: false, pool: 4300 })).toBe('4 300 Foza i potten');
    });

    it('sends a player to an admin when the code is not on the screen', () => {
        expect(joinLine(false, false)).toBe('Spør ein admin om koden, så gå te /join.');
        expect(joinLine(true, true)).toBe('Skann, så bruka koden');
        expect(joinLine(true, false)).toBe('Gå te /join, så bruka koden');
    });

    it('leaves the score out before a match starts', () => {
        expect(slotScore(null)).toBe('');
        expect(slotScore(0)).toBe('0');
    });
});
