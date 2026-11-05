import * as crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { eventCodesMatch } from './players';

vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>();
    return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

describe('eventCodesMatch', () => {
    it('matches only the same code', () => {
        expect(eventCodesMatch('LAN-2026-X', 'LAN-2026-X')).toBe(true);
        expect(eventCodesMatch('LAN-2026-X', 'LAN-2026-Y')).toBe(false);
        expect(eventCodesMatch('LAN-2026-X', 'LAN-2026')).toBe(false);
        expect(eventCodesMatch('LAN-2026-X', '')).toBe(false);
    });

    it('compares SHA-256 digests in constant time', () => {
        vi.mocked(crypto.timingSafeEqual).mockClear();
        eventCodesMatch('LAN-2026-X', 'SHORT');
        expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
        const [a, b] = vi.mocked(crypto.timingSafeEqual).mock.calls[0] as [Buffer, Buffer];
        expect(a.equals(crypto.createHash('sha256').update('LAN-2026-X').digest())).toBe(true);
        expect(b.equals(crypto.createHash('sha256').update('SHORT').digest())).toBe(true);
    });
});
