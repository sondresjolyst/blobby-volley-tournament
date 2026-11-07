import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminPost = vi.fn();
const createGameServerToken = vi.fn();
const getGameServerTokenInfo = vi.fn();

vi.mock('@/lib/auth/options', () => ({ requireAdminPost: (...args: unknown[]) => requireAdminPost(...args) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/game-server-token', () => ({
    createGameServerToken: (...args: unknown[]) => createGameServerToken(...args),
    getGameServerTokenInfo: (...args: unknown[]) => getGameServerTokenInfo(...args),
}));

import { POST } from './route';

// A placeholder, not a real token.
const TOKEN = 'test-placeholder-token';
const post = (fields: Record<string, string>) => new Request('https://bvt.example.test/api/admin/game-server-token', { method: 'POST', body: new URLSearchParams(fields) });

beforeEach(() => {
    for (const mock of [requireAdminPost, createGameServerToken, getGameServerTokenInfo]) mock.mockReset();
    requireAdminPost.mockResolvedValue({ githubId: '1' });
    createGameServerToken.mockResolvedValue({ token: TOKEN, createdAt: new Date('2026-11-20T12:00:00Z') });
});

describe('POST /api/admin/game-server-token', () => {
    it('makes the first token without a confirm and answers it once, not cached', async () => {
        getGameServerTokenInfo.mockResolvedValue(null);
        const res = await POST(post({}));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toEqual({ token: TOKEN, createdAt: '2026-11-20T12:00:00.000Z' });
    });

    it('replaces a token only with the confirm box checked', async () => {
        getGameServerTokenInfo.mockResolvedValue({ createdAt: new Date(), lastUsedAt: null });
        for (const fields of [{}, { confirm: 'on' }] as Record<string, string>[]) {
            const res = await POST(post(fields));
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: 'confirm' });
        }
        expect(createGameServerToken).not.toHaveBeenCalled();
        expect((await POST(post({ confirm: 'yes' }))).status).toBe(200);
        expect(createGameServerToken).toHaveBeenCalledTimes(1);
    });

    it('answers with the denial from requireAdminPost, such as a cross-site post', async () => {
        const denied = Response.json({ error: 'forbidden' }, { status: 403 });
        requireAdminPost.mockResolvedValueOnce(denied);
        expect(await POST(post({ confirm: 'yes' }))).toBe(denied);
        expect(createGameServerToken).not.toHaveBeenCalled();
    });
});
