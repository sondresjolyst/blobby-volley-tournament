import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashSessionToken, isSessionExpired, isWellFormedToken, newSessionToken, sessionCookieOptions, sessionExpiresAt, SESSION_MS } from './session';

const now = new Date('2026-11-05T12:00:00Z');

describe('newSessionToken', () => {
    it('makes a new random 32 byte token each time', () => {
        const a = newSessionToken();
        const b = newSessionToken();
        expect(a).not.toBe(b);
        expect(Buffer.from(a, 'base64url').length).toBe(32);
        expect(isWellFormedToken(a)).toBe(true);
    });
});

describe('hashSessionToken', () => {
    it('is the SHA-256 of the token and not the token itself', () => {
        const token = newSessionToken();
        const hash = hashSessionToken(token);
        expect(hash.equals(createHash('sha256').update(token).digest())).toBe(true);
        expect(hash.toString('base64url')).not.toBe(token);
    });

    it('gives the same hash for the same token and another for another token', () => {
        expect(hashSessionToken('a').equals(hashSessionToken('a'))).toBe(true);
        expect(hashSessionToken('a').equals(hashSessionToken('b'))).toBe(false);
    });
});

describe('session expiry', () => {
    it('lasts 7 days', () => {
        expect(SESSION_MS).toBe(7 * 24 * 60 * 60 * 1000);
        expect(sessionExpiresAt(now)).toEqual(new Date('2026-11-12T12:00:00Z'));
    });

    it('is valid until the expiry time and expired from then on', () => {
        const expiresAt = sessionExpiresAt(now);
        expect(isSessionExpired(expiresAt, now)).toBe(false);
        expect(isSessionExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
        expect(isSessionExpired(expiresAt, expiresAt)).toBe(true);
        expect(isSessionExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
    });
});

describe('sessionCookieOptions', () => {
    it('is httpOnly and SameSite=Lax, and Secure in production', () => {
        const expiresAt = sessionExpiresAt(now);
        expect(sessionCookieOptions({ NODE_ENV: 'production' }, expiresAt)).toEqual({ httpOnly: true, sameSite: 'lax', secure: true, path: '/', expires: expiresAt });
        expect(sessionCookieOptions({ NODE_ENV: 'development' }, expiresAt).secure).toBe(false);
    });
});

describe('isWellFormedToken', () => {
    it.each([undefined, '', 'short', 'x'.repeat(44), 'a'.repeat(42) + '!'])('rejects %s', (value) => {
        expect(isWellFormedToken(value)).toBe(false);
    });
});
