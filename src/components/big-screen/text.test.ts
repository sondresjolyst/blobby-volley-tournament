import { describe, expect, it } from 'vitest';
import { joinChip, joinLine, matchPill, poolLine, slotScore } from './text';

describe('big screen text', () => {
    it('names the state of a match for the pill', () => {
        expect(matchPill({ state: 'started', label: 'Semifinala, kamp 1', tournamentName: 'Hovedcupen' })).toEqual({ state: 'LIVE', label: 'Semifinala, kamp 1' });
        expect(matchPill({ state: 'called', label: 'Finale, kamp 1', tournamentName: 'Hovedcupen' }).state).toBe('ROPT OPP');
        // The players run a 1v1 match themselves, so it is ready, not called up.
        expect(matchPill({ state: 'called', label: '1v1', tournamentName: null }).state).toBe('KLAR');
        expect(matchPill({ state: 'upcoming', label: 'Finale, kamp 1', tournamentName: 'Hovedcupen' }).state).toBe('SNART');
    });

    it('says whether bets can still be placed when the pool is empty', () => {
        expect(poolLine({ open: true, pool: 0 })).toContain('Sats på /me');
        expect(poolLine({ open: false, pool: 0 })).toContain('stengt');
        expect(poolLine({ open: false, pool: 4300 })).toBe('4 300 Foza i potten');
    });

    it('tells a player to scan, or to go to /join without a QR code', () => {
        expect(joinLine(true)).toBe('Skann og bruk LAN-koden');
        expect(joinLine(false)).toBe('Gå te /join og bruk LAN-koden');
    });

    it('shows the full site address when the host is known', () => {
        expect(joinLine(false, 'julalan.no')).toBe('Gå te julalan.no/join og bruk LAN-koden');
        expect(joinChip('ABCD-1234', 'julalan.no')).toBe('Bli med på julalan.no/join · ABCD-1234');
        expect(poolLine({ open: true, pool: 0 }, 'julalan.no')).toContain('Sats på julalan.no/me!');
    });

    it('leaves the score out before a match starts', () => {
        expect(slotScore(null)).toBe('');
        expect(slotScore(0)).toBe('0');
    });
});
