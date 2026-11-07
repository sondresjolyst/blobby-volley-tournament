import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT_GAME_DELAY, isNextGameDelay } from './settings';

describe('isNextGameDelay', () => {
    it('takes whole seconds from 3 to 120, with 10 as the default', () => {
        expect(DEFAULT_NEXT_GAME_DELAY).toBe(10);
        for (const ok of [3, 10, 120]) expect(isNextGameDelay(ok)).toBe(true);
        for (const bad of [2, 121, 0, -5, 10.5, '10', null, undefined, Number.NaN]) expect(isNextGameDelay(bad)).toBe(false);
    });
});
