export const MAX_WRONG_PINS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export interface LockState {
    failedAttempts: number;
    lockedUntil: Date | null;
}

/** True while the lock is in force. */
export function isLocked(state: LockState, now: Date): boolean {
    return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * The state after one PIN check. A right PIN clears the count. The fifth wrong PIN in a row locks
 * the player for 15 minutes and starts the count again.
 */
export function afterPinCheck(state: LockState, correct: boolean, now: Date): LockState {
    if (correct) return { failedAttempts: 0, lockedUntil: null };
    const failedAttempts = state.failedAttempts + 1;
    if (failedAttempts >= MAX_WRONG_PINS) {
        return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) };
    }
    return { failedAttempts, lockedUntil: state.lockedUntil };
}
