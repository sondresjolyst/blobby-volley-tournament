import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, newNonce } from './csp';

describe('contentSecurityPolicy', () => {
    it('allows scripts by nonce only, without inline scripts or eval in production', () => {
        const policy = contentSecurityPolicy('abc', false);
        expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
        expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        expect(policy).not.toContain('unsafe-eval');
        expect(policy).toContain("frame-ancestors 'none'");
    });

    it('allows eval in development', () => {
        expect(contentSecurityPolicy('abc', true)).toContain("'strict-dynamic' 'unsafe-eval'");
    });
});

describe('newNonce', () => {
    it('makes a new base64 value each time', () => {
        const a = newNonce();
        expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(newNonce()).not.toBe(a);
    });
});
