// The key that lets the big screen show the event code and the sign-up QR code. Each event has its
// own, made by the database. Admins see it on the event page.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * True when the key from the address matches the key of the event. Always false when either is
 * missing. The SHA-256 digests have the same length, so the comparison takes the same time whatever the key is.
 */
export function bigScreenKeyMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
    if (typeof expected !== 'string' || expected === '' || typeof given !== 'string' || given === '') return false;
    return timingSafeEqual(digest(given), digest(expected));
}

/** The path of the big screen, with the key when there is one. */
export function bigScreenHref(key: string | null): string {
    return key ? `/big?key=${encodeURIComponent(key)}` : '/big';
}

/** The full address of the big screen with the key, from NEXTAUTH_URL. Only the path when it is not set. */
export function bigScreenUrl(key: string, env: Record<string, string | undefined>): string {
    const path = bigScreenHref(key);
    if (!env.NEXTAUTH_URL) return path;
    try {
        return new URL(path, env.NEXTAUTH_URL).toString();
    } catch {
        return path;
    }
}
