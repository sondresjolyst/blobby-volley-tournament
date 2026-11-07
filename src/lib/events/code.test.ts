import { describe, expect, it } from 'vitest';
import { eventCodeFromName, isEventCode, randomEventCode, suggestEventCode } from './code';
import { parseEventInput } from './input';

const form = { name: 'LAN', startsOn: '2026-11-20', endsOn: '2026-11-22', startingFoza: '1000', dailyFoza: '100' };
const accepted = (code: string) => isEventCode(code) && parseEventInput({ ...form, code }).ok;

describe('randomEventCode', () => {
    it('makes codes the event form accepts, without look-alike characters', () => {
        for (let i = 0; i < 500; i++) {
            const code = randomEventCode();
            expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
            expect(code).not.toMatch(/[0O1IL]/);
            expect(accepted(code)).toBe(true);
        }
    });

    it('makes a new code each time', () => {
        const codes = new Set(Array.from({ length: 50 }, randomEventCode));
        expect(codes.size).toBe(50);
    });
});

describe('eventCodeFromName', () => {
    it.each([
        ['JulaLAN 2026', 'JULALAN-2026'],
        ['  Jula   LAN  ', 'JULA-LAN'],
        ['Påske-LAN på Øvre Ærø', 'PAASKE-LAN-PAA-OEVRE-AEROE'],
        ['Café Crème 2027!', 'CAFE-CREME-2027'],
    ])('makes %s into %s', (name, code) => {
        expect(eventCodeFromName(name)).toBe(code);
        expect(accepted(code)).toBe(true);
    });

    it('cuts a long name to 32 characters without a hyphen at the end', () => {
        const code = eventCodeFromName('The very long winter LAN party of the year 2026')!;
        expect(code.length).toBeLessThanOrEqual(32);
        expect(code).not.toMatch(/-$/);
        expect(accepted(code)).toBe(true);
    });

    it.each(['LAN', 'A', 'Å'])('adds random characters to the short name %s', (name) => {
        const code = eventCodeFromName(name)!;
        expect(code.startsWith(`${name.replace('Å', 'AA')}-`)).toBe(true);
        expect(accepted(code)).toBe(true);
    });

    it.each(['', '   ', '!!!'])('gives null for %j', (name) => {
        expect(eventCodeFromName(name)).toBeNull();
    });
});

describe('suggestEventCode', () => {
    it('uses the name when there is one and a random code otherwise', () => {
        expect(suggestEventCode('JulaLAN 2026')).toBe('JULALAN-2026');
        expect(accepted(suggestEventCode(''))).toBe(true);
    });
});
