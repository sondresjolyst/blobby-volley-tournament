import { describe, expect, it } from 'vitest';
import { RateWindow } from './rate-window';

describe('RateWindow', () => {
    it('lets each bucket make the limit of requests per window, and starts over with the next window', () => {
        let now = 1_000;
        const window = new RateWindow(2, 60_000, () => now);
        expect([window.take('a'), window.take('a'), window.take('a')]).toEqual([true, true, false]);
        expect(window.take('b')).toBe(true);
        now += 59_999;
        expect(window.take('a')).toBe(false);
        now += 1;
        expect(window.take('a')).toBe(true);
    });
});
