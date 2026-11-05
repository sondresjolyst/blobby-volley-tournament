export const MAX_WRONG_PINS = 5;
const MINUTE_MS = 60 * 1000;

/** Lock lengths in a row: 15 minutes, then 30, then 60 for every lock after that. */
export const LOCK_STEPS_MS = [15 * MINUTE_MS, 30 * MINUTE_MS, 60 * MINUTE_MS] as const;

/**
 * How long the next lock lasts. The level is the number of locks the player has had in a row
 * without a right PIN in between.
 */
export function lockDurationMs(level: number): number {
    const step = Math.min(Math.max(Math.trunc(level), 0), LOCK_STEPS_MS.length - 1);
    return LOCK_STEPS_MS[step];
}

/** True while the lock is in force. */
export function isLocked(lockedUntil: Date | null, now: Date): boolean {
    return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
