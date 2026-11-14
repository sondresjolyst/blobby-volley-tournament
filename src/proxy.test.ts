import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();
vi.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => getToken(...args) }));

import { proxy } from './proxy';

const call = (path: string) => proxy(new NextRequest(new URL(path, 'https://bvt.example.test')));
const passes = (res: Response) => res.headers.get('x-middleware-next') === '1';

afterEach(() => {
    vi.restoreAllMocks();
    getToken.mockReset();
    vi.unstubAllEnvs();
});

describe('proxy', () => {
    it('leaves other pages public without reading a token', async () => {
        for (const path of ['/', '/health', '/events', '/administrator']) {
            expect(passes(await call(path))).toBe(true);
        }
        expect(getToken).not.toHaveBeenCalled();
    });

    it('leaves the game server API to its own token check, even when the auth address is misconfigured', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://bvt.example.test');
        for (const path of ['/api/server/sync', '/api/server/games', '/api/server/matches/7/connected', '/api/server/live', '/api/matches/7/live']) {
            expect(passes(await call(path))).toBe(true);
        }
        expect(getToken).not.toHaveBeenCalled();
    });

    it('redirects an admin page without a session to sign-in', async () => {
        getToken.mockResolvedValue(null);
        const res = await call('/admin/players');
        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location')!);
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('callbackUrl')).toBe('/admin/players');
    });

    it('answers 401 for an admin API path without a session', async () => {
        getToken.mockResolvedValue(null);
        expect((await call('/api/admin/foza')).status).toBe(401);
    });

    it('does not let an encoded admin path through', async () => {
        getToken.mockResolvedValue(null);
        expect(passes(await call('/%61dmin'))).toBe(false);
    });

    it('lets an admin through', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '1,12345');
        getToken.mockResolvedValue({ githubId: '12345' });
        expect(passes(await call('/admin'))).toBe(true);
    });

    it('sends another account to the denied page, or 403 for the API', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '99999');
        getToken.mockResolvedValue({ githubId: '12345' });
        const page = await call('/admin');
        expect(passes(page)).toBe(false);
        expect(new URL(page.headers.get('location')!).pathname).toBe('/denied');
        expect((await call('/api/admin/x')).status).toBe(403);
    });

    it('fails closed with 503 for admin pages in production without an https NEXTAUTH_URL', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://bvt.example.test');
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        getToken.mockResolvedValue({ githubId: '12345' });
        expect((await call('/admin')).status).toBe(503);
        expect((await call('/api/admin/x')).status).toBe(503);
    });

    it.each(['/api/auth/callback/github', '/api/auth/signin', '/auth-error'])('returns 503 for %s when the auth address is misconfigured', async (path) => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://bvt.example.test');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await call(path);
        expect(res.status).toBe(503);
        expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('sets a policy with a new nonce on every response and hands it to the page', async () => {
        getToken.mockResolvedValue(null);
        const first = await call('/');
        const second = await call('/');
        const policy = first.headers.get('content-security-policy')!;
        const nonce = /'nonce-([^']+)'/.exec(policy)![1];
        expect(policy).toContain("'strict-dynamic'");
        expect(second.headers.get('content-security-policy')).not.toContain(nonce);
        expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
        expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
        expect((await call('/admin')).headers.get('content-security-policy')).toMatch(/'nonce-/);
    });

    it('keeps public pages open when the auth address is misconfigured', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://bvt.example.test');
        expect(passes(await call('/'))).toBe(true);
        expect(passes(await call('/health'))).toBe(true);
        // Players sign in on /login too, so it stays open.
        expect(passes(await call('/login'))).toBe(true);
    });
});
