import { describe, expect, it } from 'vitest';
import { afterPinCheck, isLocked, LOCK_MS, type LockState } from './lockout';

const now = new Date('2026-11-05T12:00:00Z');
const fresh: LockState = { failedAttempts: 0, lockedUntil: null };

function wrong(times: number, start: LockState = fresh): LockState {
    let state = start;
    for (let i = 0; i < times; i++) state = afterPinCheck(state, false, now);
    return state;
}

describe('afterPinCheck', () => {
    it('counts wrong PINs without locking for the first 4', () => {
        const state = wrong(4);
        expect(state).toEqual({ failedAttempts: 4, lockedUntil: null });
        expect(isLocked(state, now)).toBe(false);
    });

    it('locks for 15 minutes on the fifth wrong PIN in a row', () => {
        const state = wrong(5);
        expect(state.lockedUntil).toEqual(new Date(now.getTime() + 15 * 60 * 1000));
        expect(LOCK_MS).toBe(15 * 60 * 1000);
        expect(isLocked(state, now)).toBe(true);
    });

    it('clears the count after a right PIN, so wrong PINs must be in a row', () => {
        const afterRight = afterPinCheck(wrong(4), true, now);
        expect(afterRight).toEqual({ failedAttempts: 0, lockedUntil: null });
        expect(isLocked(wrong(4, afterRight), now)).toBe(false);
    });

    it('starts a new count after a lock', () => {
        expect(wrong(5).failedAttempts).toBe(0);
    });
});

describe('isLocked', () => {
    it('ends when the 15 minutes have passed', () => {
        const state = wrong(5);
        expect(isLocked(state, new Date(now.getTime() + LOCK_MS - 1))).toBe(true);
        expect(isLocked(state, new Date(now.getTime() + LOCK_MS))).toBe(false);
    });

    it('is false without a lock', () => {
        expect(isLocked(fresh, now)).toBe(false);
    });
});
