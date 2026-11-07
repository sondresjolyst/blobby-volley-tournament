import { describe, expect, it } from 'vitest';
import { bigScreenHref, bigScreenKeyMatches } from './key';

describe('bigScreenKeyMatches', () => {
    const env = { BIG_SCREEN_KEY: 'tv-key-1' };

    it('accepts only the exact key', () => {
        expect(bigScreenKeyMatches('tv-key-1', env)).toBe(true);
        expect(bigScreenKeyMatches('tv-key-2', env)).toBe(false);
        expect(bigScreenKeyMatches('tv-key-1 ', env)).toBe(false);
        expect(bigScreenKeyMatches('', env)).toBe(false);
        expect(bigScreenKeyMatches(null, env)).toBe(false);
    });

    it('accepts nothing when BIG_SCREEN_KEY is not set', () => {
        expect(bigScreenKeyMatches('', {})).toBe(false);
        expect(bigScreenKeyMatches('anything', { BIG_SCREEN_KEY: '' })).toBe(false);
    });
});

describe('bigScreenHref', () => {
    it('adds the key to the address when it is set', () => {
        expect(bigScreenHref({ BIG_SCREEN_KEY: 'a b&c' })).toBe('/big?key=a%20b%26c');
        expect(bigScreenHref({})).toBe('/big');
    });
});
