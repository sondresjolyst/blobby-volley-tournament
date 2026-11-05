import { describe, expect, it } from 'vitest';
import { normalizeEventCode, parseEventInput } from './input';

const form = { name: ' LAN 2026 ', startsOn: '2026-11-20', endsOn: '2026-11-22', code: ' lan-2026 ', startingFoza: '1000', dailyFoza: '100' };

describe('parseEventInput', () => {
    it('reads a valid form, trims it and puts the code in upper case', () => {
        expect(parseEventInput(form)).toEqual({
            ok: true,
            value: { name: 'LAN 2026', startsOn: '2026-11-20', endsOn: '2026-11-22', code: 'LAN-2026', startingFoza: 1000, dailyFoza: 100 },
        });
    });

    it('allows an event on one day', () => {
        expect(parseEventInput({ ...form, endsOn: form.startsOn }).ok).toBe(true);
    });

    it.each([
        ['name', { name: '  ' }],
        ['name', { name: 'x'.repeat(101) }],
        ['dates', { endsOn: '2026-11-19' }],
        ['dates', { startsOn: '2026-02-30' }],
        ['dates', { startsOn: '20.11.2026' }],
        ['code', { code: 'abc' }],
        ['code', { code: 'lan 2026' }],
        ['foza', { startingFoza: '-1' }],
        ['foza', { dailyFoza: '1.5' }],
        ['foza', { dailyFoza: '1000001' }],
        ['foza', { startingFoza: '' }],
    ])('rejects a bad %s', (error, change) => {
        expect(parseEventInput({ ...form, ...change })).toEqual({ ok: false, error });
    });
});

describe('normalizeEventCode', () => {
    it('trims and uses upper case', () => {
        expect(normalizeEventCode(' lan-2026 ')).toBe('LAN-2026');
        expect(normalizeEventCode(undefined)).toBe('');
    });
});
