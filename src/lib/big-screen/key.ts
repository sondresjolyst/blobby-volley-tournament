// The key that lets the big screen show the event code and the sign-up QR code.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * True when the key from the address matches BIG_SCREEN_KEY. Always false when the variable is not
 * set. The SHA-256 digests have the same length, so the comparison takes the same time whatever the key is.
 */
export function bigScreenKeyMatches(given: string | null | undefined, env: Record<string, string | undefined>): boolean {
    const expected = env.BIG_SCREEN_KEY;
    if (!expected || typeof given !== 'string' || given === '') return false;
    return timingSafeEqual(digest(given), digest(expected));
}

/** The address of the big screen, with the key when BIG_SCREEN_KEY is set. */
export function bigScreenHref(env: Record<string, string | undefined>): string {
    return env.BIG_SCREEN_KEY ? `/big?key=${encodeURIComponent(env.BIG_SCREEN_KEY)}` : '/big';
}
