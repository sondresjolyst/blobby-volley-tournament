import { describe, expect, it } from 'vitest';
import { bigScreenHref, bigScreenKeyMatches, bigScreenUrl } from './key';

describe('bigScreenKeyMatches', () => {
    const expected = 'tv-key-1';

    it('accepts only the exact key', () => {
        expect(bigScreenKeyMatches('tv-key-1', expected)).toBe(true);
        expect(bigScreenKeyMatches('tv-key-2', expected)).toBe(false);
        expect(bigScreenKeyMatches('tv-key-1 ', expected)).toBe(false);
        expect(bigScreenKeyMatches('', expected)).toBe(false);
        expect(bigScreenKeyMatches(null, expected)).toBe(false);
        expect(bigScreenKeyMatches(undefined, expected)).toBe(false);
    });

    it('accepts nothing when the event has no key', () => {
        expect(bigScreenKeyMatches('', null)).toBe(false);
        expect(bigScreenKeyMatches('anything', null)).toBe(false);
        expect(bigScreenKeyMatches('', '')).toBe(false);
    });
});

describe('bigScreenHref', () => {
    it('adds the key to the address when there is one', () => {
        expect(bigScreenHref('a b&c')).toBe('/big?key=a%20b%26c');
        expect(bigScreenHref(null)).toBe('/big');
    });
});

describe('bigScreenUrl', () => {
    it('is the full address from NEXTAUTH_URL', () => {
        expect(bigScreenUrl('Ab_9-x', { NEXTAUTH_URL: 'https://bvt.example.test' })).toBe('https://bvt.example.test/big?key=Ab_9-x');
        expect(bigScreenUrl('Ab_9-x', { NEXTAUTH_URL: 'https://bvt.example.test/sub/' })).toBe('https://bvt.example.test/big?key=Ab_9-x');
    });

    it('is only the path without a valid NEXTAUTH_URL', () => {
        expect(bigScreenUrl('Ab_9-x', {})).toBe('/big?key=Ab_9-x');
        expect(bigScreenUrl('Ab_9-x', { NEXTAUTH_URL: 'not a url' })).toBe('/big?key=Ab_9-x');
    });
});
