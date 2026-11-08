import { describe, expect, it } from 'vitest';
import { authMisconfigured, isAuthPath, isProtectedPath, safeCallback, signInUrl } from './gate';

describe('isProtectedPath', () => {
    it.each(['/admin', '/admin/', '/admin/players', '/api/admin', '/api/admin/foza', '/Admin', '/ADMIN/x', '/%61dmin', '/%2561dmin', '/admin%2Fx', '/x/../admin', '/a\\b', '/%E0%A4%A', '//admin', '/api//admin/x', '/%2F%2Fadmin'])(
        'keeps %s behind the admin check',
        (path) => {
            expect(isProtectedPath(path)).toBe(true);
        },
    );

    it.each(['/', '/health', '/login', '/denied', '/auth-error', '/api/auth/signin', '/administrator', '/admins', '/api/administrator', '/api/auth/admin-x', '/events', '/_next/image'])(
        'leaves %s public',
        (path) => {
            expect(isProtectedPath(path)).toBe(false);
        },
    );
});

describe('isAuthPath', () => {
    it.each(['/denied', '/auth-error', '/api/auth', '/api/auth/callback/github'])('treats %s as a sign-in route', (path) => {
        expect(isAuthPath(path)).toBe(true);
    });

    it.each(['/', '/admin', '/login', '/signin', '/api/authx', '/health'])('does not treat %s as a sign-in route', (path) => {
        expect(isAuthPath(path)).toBe(false);
    });
});

describe('signInUrl', () => {
    const origin = 'https://bvt.example.test';

    it('sends the visitor back to the same page', () => {
        const url = new URL(signInUrl(new URL('/admin?x=1', origin)), origin);
        expect(url.pathname).toBe('/login');
        expect(url.searchParams.get('callbackUrl')).toBe('/admin?x=1');
    });

    it('keeps the callback on the same origin for odd paths', () => {
        for (const path of ['//evil.test/x', '/\\evil.test', '/%2F%2Fevil.test']) {
            // Built from the origin and the path, so `//evil.test/x` stays a path and is not read as a host.
            const request = new URL(origin + path);
            expect(request.origin).toBe(origin);
            const url = new URL(signInUrl(request), origin);
            const callback = url.searchParams.get('callbackUrl')!;
            expect(new URL(callback, origin).origin).toBe(origin);
        }
    });

    it('sends a path that starts with two slashes to the start page', () => {
        const url = new URL(signInUrl(new URL(origin + '//evil.test/x')), origin);
        expect(url.searchParams.get('callbackUrl')).toBe('/');
    });
});

describe('safeCallback', () => {
    it('keeps a path on this site', () => {
        expect(safeCallback('/admin?x=1')).toBe('/admin?x=1');
    });

    it.each([undefined, '', 'https://evil.test/x', '//evil.test', '/\\evil.test', 'admin', ['/a']])('falls back to the start page for %s', (value) => {
        expect(safeCallback(value)).toBe('/');
    });
});

describe('authMisconfigured', () => {
    it('fails closed in production without an https NEXTAUTH_URL', () => {
        expect(authMisconfigured({ NODE_ENV: 'production' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: '' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'http://bvt.example.test' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'http://localhost:3000' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'not a url' })).toBe(true);
    });

    it('requires the literal lower case https:// prefix', () => {
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'HTTPS://bvt.example.test' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: ' https://bvt.example.test' })).toBe(true);
    });

    it('accepts https in production', () => {
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'https://bvt.example.test' })).toBe(false);
    });

    it('allows http on localhost outside production', () => {
        expect(authMisconfigured({ NODE_ENV: 'development', NEXTAUTH_URL: 'http://localhost:3000' })).toBe(false);
        expect(authMisconfigured({ NODE_ENV: 'test' })).toBe(false);
    });
});
