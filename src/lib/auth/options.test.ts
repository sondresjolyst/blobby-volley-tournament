import { afterEach, describe, expect, it, vi } from 'vitest';
import { getServerSession, type Session } from 'next-auth';
import { authOptions, isAllowedUser, requireAdmin, requireAdminPost, requireAdminRead } from './options';

vi.mock('next-auth', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next-auth')>()),
    getServerSession: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next/navigation', () => ({
    redirect: (to: string) => {
        throw new Error('redirect:' + to);
    },
}));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('isAllowedUser', () => {
    it('allowed ID passes', () => {
        expect(isAllowedUser('12345', '12345')).toBe(true);
    });

    it('accepts a numeric ID from the token', () => {
        expect(isAllowedUser(12345, '12345')).toBe(true);
    });

    it('accepts any ID in a comma separated list', () => {
        expect(isAllowedUser('67890', '12345, 67890')).toBe(true);
        expect(isAllowedUser('12345', '12345,67890')).toBe(true);
    });

    it('other ID fails', () => {
        expect(isAllowedUser('54321', '12345,67890')).toBe(false);
        expect(isAllowedUser('1234', '12345')).toBe(false);
    });

    it('unset allowlist denies everyone', () => {
        expect(isAllowedUser('12345', undefined)).toBe(false);
        expect(isAllowedUser(undefined, undefined)).toBe(false);
    });

    it('empty allowlist denies everyone', () => {
        expect(isAllowedUser('', '')).toBe(false);
        expect(isAllowedUser('12345', '')).toBe(false);
        expect(isAllowedUser('12345', ' , ')).toBe(false);
    });

    it('matching login with a different ID fails', () => {
        expect(isAllowedUser('octocat', '12345')).toBe(false);
        expect(isAllowedUser('octocat', 'octocat')).toBe(false);
    });

    it('ignores entries that are not only digits', () => {
        expect(isAllowedUser('-1', '-1')).toBe(false);
        expect(isAllowedUser('1.5', '1.5')).toBe(false);
        expect(isAllowedUser('12345', '1 2 3 4 5')).toBe(false);
        expect(isAllowedUser('12345', 'octocat,12345')).toBe(true);
    });

    it('rejects a missing or malformed ID', () => {
        expect(isAllowedUser(null, '12345')).toBe(false);
        expect(isAllowedUser(undefined, '12345')).toBe(false);
        expect(isAllowedUser({}, '12345')).toBe(false);
        expect(isAllowedUser(['12345'], '12345')).toBe(false);
        expect(isAllowedUser(Number.NaN, '12345')).toBe(false);
        expect(isAllowedUser(1e21, '1000000000000000000000')).toBe(false);
    });
});

describe('callbacks', () => {
    const signIn = authOptions.callbacks!.signIn!;
    const jwt = authOptions.callbacks!.jwt!;
    const session = authOptions.callbacks!.session!;

    it('signIn callback returns the denied page for other accounts', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        expect(await signIn({ user: { id: '999' }, account: null })).toBe('/denied');
    });

    it('signIn callback returns the denied page when the allowlist is unset', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '');
        expect(await signIn({ user: { id: '12345' }, account: null })).toBe('/denied');
    });

    it('signIn callback lets an admin in', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '1,12345');
        expect(await signIn({ user: { id: '12345' }, account: null })).toBe(true);
    });

    it('stores the numeric ID in the token at sign-in and keeps it later', async () => {
        const first = await jwt({ token: {}, user: { id: '12345' } } as Parameters<typeof jwt>[0]);
        expect(first.githubId).toBe('12345');
        const later = await jwt({ token: first } as Parameters<typeof jwt>[0]);
        expect(later.githubId).toBe('12345');
    });

    it('puts the ID on the session', async () => {
        const result = await session({ session: { expires: 'x' }, token: { githubId: '12345' } } as Parameters<typeof session>[0]);
        expect((result as Session).githubId).toBe('12345');
    });

    it('uses the profile ID as the ID and the login as the name', () => {
        const provider = authOptions.providers[0] as unknown as {
            options: { profile: (p: Record<string, unknown>) => { id: string; name: string | null } };
        };
        const user = provider.options.profile({ id: 12345, login: 'octocat', name: 'x', email: 'a@b.c', avatar_url: '' });
        expect(user).toEqual({ id: '12345', name: 'octocat' });
    });
});

describe('requireAdmin', () => {
    it('redirects to sign-in without a session', async () => {
        vi.mocked(getServerSession).mockResolvedValue(null);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        await expect(requireAdmin()).rejects.toThrow('redirect:/login');
    });

    it('redirects to the denied page for another ID', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '999', expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        await expect(requireAdmin()).rejects.toThrow('redirect:/denied');
    });

    it('redirects to the denied page when the allowlist is unset', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '12345', expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '');
        await expect(requireAdmin()).rejects.toThrow('redirect:/denied');
    });

    it('redirects to the denied page when the session has no ID', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        await expect(requireAdmin()).rejects.toThrow('redirect:/denied');
    });

    it('returns the session for an admin', async () => {
        const admin = { githubId: '12345', expires: 'x' };
        vi.mocked(getServerSession).mockResolvedValue(admin);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        await expect(requireAdmin()).resolves.toBe(admin);
    });

    it('fails closed in production without an https NEXTAUTH_URL', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '12345', expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://bvt.example.test');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(requireAdmin()).rejects.toThrow('NEXTAUTH_URL');
    });
});

// A post the browser marks as from this site.
const samePost = () => new Request('https://bvt.example.test/api/admin/events', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } });

describe('requireAdminPost', () => {
    it('answers 401 without a session', async () => {
        vi.mocked(getServerSession).mockResolvedValue(null);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        const result = await requireAdminPost(samePost());
        expect(result).toBeInstanceOf(Response);
        expect((result as Response).status).toBe(401);
    });

    it('answers 403 for another account', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '999', expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        expect(((await requireAdminPost(samePost())) as Response).status).toBe(403);
    });

    it('answers 403 when the allowlist is unset', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '12345', expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '');
        expect(((await requireAdminPost(samePost())) as Response).status).toBe(403);
    });

    it('returns the session for an admin', async () => {
        const admin = { githubId: '12345', expires: 'x' };
        vi.mocked(getServerSession).mockResolvedValue(admin);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        await expect(requireAdminPost(samePost())).resolves.toBe(admin);
    });

    it.each<Record<string, string>>([{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { origin: 'https://evil.test' }, {}])(
        'answers 403 for a post that does not come from this site, even for an admin (%o)',
        async (headers) => {
            vi.mocked(getServerSession).mockResolvedValue({ githubId: '12345', expires: 'x' });
            vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
            vi.stubEnv('NEXTAUTH_URL', 'https://bvt.example.test');
            const req = new Request('https://bvt.example.test/api/admin/events', { method: 'POST', headers });
            expect(((await requireAdminPost(req)) as Response).status).toBe(403);
        },
    );

    it.each<Record<string, string>>([{ 'sec-fetch-site': 'same-origin' }, { origin: 'https://bvt.example.test' }])('lets an admin post from this site (%o)', async (headers) => {
        const admin = { githubId: '12345', expires: 'x' };
        vi.mocked(getServerSession).mockResolvedValue(admin);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        vi.stubEnv('NEXTAUTH_URL', 'https://bvt.example.test');
        const req = new Request('https://bvt.example.test/api/admin/events', { method: 'POST', headers });
        await expect(requireAdminPost(req)).resolves.toBe(admin);
    });

    it('answers 503 in production without an https NEXTAUTH_URL', async () => {
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '12345', expires: 'x' });
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://bvt.example.test');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(((await requireAdminPost(samePost())) as Response).status).toBe(503);
    });
});

describe('requireAdminRead', () => {
    const admin = { githubId: '12345', expires: 'x' };
    const get = (headers: Record<string, string>) => new Request('https://bvt.example.test/api/admin/sponsors/1/logo', { headers });

    it.each<Record<string, string>>([{}, { 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }])('lets an admin read without Origin or from this site (%o)', async (headers) => {
        vi.mocked(getServerSession).mockResolvedValue(admin);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        await expect(requireAdminRead(get(headers))).resolves.toBe(admin);
    });

    it.each<Record<string, string>>([{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }])('answers 403 for a read from another site, even for an admin (%o)', async (headers) => {
        vi.mocked(getServerSession).mockResolvedValue(admin);
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        expect(((await requireAdminRead(get(headers))) as Response).status).toBe(403);
    });

    it('answers 401 without a session and 403 for another account', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_IDS', '12345');
        vi.mocked(getServerSession).mockResolvedValue(null);
        expect(((await requireAdminRead(get({}))) as Response).status).toBe(401);
        vi.mocked(getServerSession).mockResolvedValue({ githubId: '999', expires: 'x' });
        expect(((await requireAdminRead(get({}))) as Response).status).toBe(403);
    });
});
