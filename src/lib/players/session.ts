import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'bvt_player';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/** A new random session token for the cookie. Only its hash goes in the database. */
export function newSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

/** The SHA-256 hash of a session token, as stored in player_sessions.token_hash. */
export function hashSessionToken(token: string): Buffer {
    return createHash('sha256').update(token, 'utf8').digest();
}

export function sessionExpiresAt(now: Date): Date {
    return new Date(now.getTime() + SESSION_MS);
}

export function isSessionExpired(expiresAt: Date, now: Date): boolean {
    return expiresAt.getTime() <= now.getTime();
}

/** The cookie settings. The Secure flag is on in production. */
export function sessionCookieOptions(env: Record<string, string | undefined>, expiresAt: Date) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: env.NODE_ENV === 'production',
        path: '/',
        expires: expiresAt,
    };
}

/** A token as the cookie holds it: 43 base64url characters. Anything else is not looked up. */
export function isWellFormedToken(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
