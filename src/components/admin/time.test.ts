import { describe, expect, it } from 'vitest';
import { adminTime } from './time';

describe('adminTime', () => {
    it('writes the time in Europe/Oslo, in winter and in summer', () => {
        expect(adminTime(new Date('2026-11-20T18:04:05Z'))).toBe('20 Nov 2026, 19:04:05 CET');
        expect(adminTime(new Date('2026-07-01T00:00:00Z'))).toBe('1 Jul 2026, 02:00:00 CEST');
    });
});
