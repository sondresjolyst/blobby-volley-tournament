import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminPost = vi.fn();
const getPool = vi.fn(() => {
    throw new Error('the database is not used for a form that is sent back');
});

vi.mock('@/lib/auth/options', () => ({ requireAdminPost: (...args: unknown[]) => requireAdminPost(...args) }));
vi.mock('@/lib/db', () => ({ getPool: () => getPool() }));

const post = (body: URLSearchParams) => new Request('https://bvt.example.test/api/admin/x', { method: 'POST', body });

beforeEach(() => {
    requireAdminPost.mockReset();
    requireAdminPost.mockResolvedValue({ githubId: '1' });
});

describe('a player form that is sent back', () => {
    it('keeps the page and the search of the player list', async () => {
        const { POST } = await import('./players/[id]/pin/route');
        const res = await POST(post(new URLSearchParams({ eventId: '3', pin: '12', players: '2', q: 'ab' })), { params: Promise.resolve({ id: '7' }) });
        expect(res.headers.get('location')).toBe('/admin/events/3?players=2&q=ab&error=pin');
    });

    it('leaves out a bad page', async () => {
        const { POST } = await import('./players/[id]/foza/route');
        const res = await POST(post(new URLSearchParams({ eventId: '3', amount: 'x', reason: 'r', players: 'abc' })), { params: Promise.resolve({ id: '7' }) });
        expect(res.headers.get('location')).toBe('/admin/events/3?error=foza-form');
    });
});

describe('a call form without matches', () => {
    it('keeps the pages and the search of the match lists', async () => {
        const { POST } = await import('./matches/call/route');
        const res = await POST(post(new URLSearchParams({ upcoming: '2', finished: '3', q: 'cup' })));
        expect(res.headers.get('location')).toBe('/admin/matches?upcoming=2&finished=3&q=cup&error=form');
    });
});
