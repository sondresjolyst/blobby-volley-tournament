import { describe, expect, it } from 'vitest';
import { eventCodeFromName, isEventCode, randomEventCode, randomSuffix, suggestEventCode } from './code';
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

describe('randomSuffix', () => {
    it('gives six readable characters', () => {
        for (let i = 0; i < 200; i++) expect(randomSuffix()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    });
});

describe('eventCodeFromName', () => {
    const suffix = 'K7RMP4';

    it.each([
        ['JulaLAN 2026', 'JULALAN-2026-K7RM'],
        ['  Jula   LAN  ', 'JULA-LAN-K7RM'],
        ['Påske-LAN på Øvre Ærø', 'PAASKE-LAN-PAA-OEVRE-AEROE-K7RM'],
        ['Café Crème 2027!', 'CAFE-CREME-2027-K7RM'],
        ['LAN', 'LAN-K7RM'],
        ['Æ', 'AE-K7RMP'],
        ['A', 'A-K7RMP4'],
    ])('makes %s into %s', (name, code) => {
        expect(eventCodeFromName(name, suffix)).toBe(code);
        expect(accepted(code)).toBe(true);
    });

    it('always ends with the random part, so the public name alone does not give the code', () => {
        for (let i = 0; i < 100; i++) {
            const own = randomSuffix();
            const code = eventCodeFromName('JulaLAN 2026', own)!;
            expect(code).toBe(`JULALAN-2026-${own.slice(0, 4)}`);
            expect(accepted(code)).toBe(true);
        }
    });

    it('cuts a long name so the code with its random part fits in 32 characters', () => {
        const code = eventCodeFromName('The very long winter LAN party of the year 2026', suffix)!;
        expect(code.length).toBeLessThanOrEqual(32);
        expect(code).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*-K7RM$/);
        expect(accepted(code)).toBe(true);
    });

    it.each(['', '   ', '!!!'])('gives null for %j', (name) => {
        expect(eventCodeFromName(name, suffix)).toBeNull();
    });
});

describe('suggestEventCode', () => {
    it('uses the name when there is one and a random code otherwise', () => {
        expect(suggestEventCode('JulaLAN 2026', 'K7RMP4')).toBe('JULALAN-2026-K7RM');
        expect(suggestEventCode('', 'K7RMP4')).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    });
});
