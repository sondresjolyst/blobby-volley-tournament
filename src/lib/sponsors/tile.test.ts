import { describe, expect, it } from 'vitest';
import { DEFAULT_TILE_BACKGROUND, tileBackground } from './tile';

describe('tileBackground', () => {
    it('uses the background colour of the sponsor', () => {
        expect(tileBackground('#123abc')).toBe('#123abc');
    });

    it('falls back to the dark brown for a sponsor without one', () => {
        expect(tileBackground(null)).toBe(DEFAULT_TILE_BACKGROUND);
    });
});
