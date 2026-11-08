import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
    it('loads once for readers within the time to live, and again after it', async () => {
        let now = 1_000;
        const cache = new TtlCache<number>(3_000, () => now);
        const load = vi.fn(async () => now);
        const [a, b] = await Promise.all([cache.get('e1', load), cache.get('e1', load)]);
        expect([a, b]).toEqual([1_000, 1_000]);
        now += 2_999;
        expect(await cache.get('e1', load)).toBe(1_000);
        expect(load).toHaveBeenCalledTimes(1);
        now += 1;
        expect(await cache.get('e1', load)).toBe(4_000);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('keeps each key apart', async () => {
        const cache = new TtlCache<string>(3_000, () => 0);
        expect(await cache.get('e1:', async () => 'one')).toBe('one');
        expect(await cache.get('e1:7', async () => 'seven')).toBe('seven');
        expect(await cache.get('e1:', async () => 'again')).toBe('one');
    });

    it('does not keep a failed load', async () => {
        const cache = new TtlCache<string>(3_000, () => 0);
        await expect(cache.get('e1', async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
        expect(await cache.get('e1', async () => 'back')).toBe('back');
    });
});
