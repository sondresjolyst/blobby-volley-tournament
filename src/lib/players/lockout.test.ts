import { describe, expect, it } from 'vitest';
import { countedWrongPins, isLocked, lockDurationMs, MAX_WRONG_PINS, WRONG_PIN_MEMORY_MS } from './lockout';

const now = new Date('2026-11-05T12:00:00Z');
const MINUTE = 60 * 1000;

describe('lockDurationMs', () => {
    it('locks for 15, then 30, then 60 minutes', () => {
        expect(lockDurationMs(0)).toBe(15 * MINUTE);
        expect(lockDurationMs(1)).toBe(30 * MINUTE);
        expect(lockDurationMs(2)).toBe(60 * MINUTE);
    });

    it('stays at 60 minutes after the third lock', () => {
        expect(lockDurationMs(3)).toBe(60 * MINUTE);
        expect(lockDurationMs(50)).toBe(60 * MINUTE);
    });

    it('treats a bad level as the first lock', () => {
        expect(lockDurationMs(-1)).toBe(15 * MINUTE);
    });
});

describe('isLocked', () => {
    it('is true until the lock ends', () => {
        const until = new Date(now.getTime() + 15 * MINUTE);
        expect(isLocked(until, now)).toBe(true);
        expect(isLocked(until, new Date(until.getTime() - 1))).toBe(true);
        expect(isLocked(until, until)).toBe(false);
    });

    it('is false without a lock', () => {
        expect(isLocked(null, now)).toBe(false);
    });
});

it('locks after 5 wrong PINs', () => {
    expect(MAX_WRONG_PINS).toBe(5);
});

describe('countedWrongPins', () => {
    it('counts the wrong PINs until the last one is a day old', () => {
        expect(countedWrongPins(3, new Date(now.getTime() - MINUTE), now)).toBe(3);
        expect(countedWrongPins(3, new Date(now.getTime() - WRONG_PIN_MEMORY_MS + 1), now)).toBe(3);
        expect(countedWrongPins(3, new Date(now.getTime() - WRONG_PIN_MEMORY_MS), now)).toBe(0);
    });

    it('is zero without a wrong PIN', () => {
        expect(countedWrongPins(0, null, now)).toBe(0);
        expect(countedWrongPins(2, null, now)).toBe(0);
    });
});
