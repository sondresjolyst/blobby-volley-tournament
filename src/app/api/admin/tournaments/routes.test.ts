import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminApi = vi.fn();
const setNextGameDelay = vi.fn();

vi.mock('@/lib/auth/options', () => ({ requireAdminApi: (...args: unknown[]) => requireAdminApi(...args) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/tournaments', () => ({ setNextGameDelay: (...args: unknown[]) => setNextGameDelay(...args) }));

import { POST as pause } from './[id]/next-game-delay/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (fields: Record<string, string>) => new Request('https://bvt.example.test/api/admin/tournaments/4/next-game-delay', { method: 'POST', body: new URLSearchParams(fields) });

beforeEach(() => {
    requireAdminApi.mockReset();
    setNextGameDelay.mockReset();
    requireAdminApi.mockResolvedValue({ githubId: '1' });
});

describe('POST /api/admin/tournaments/{id}/next-game-delay', () => {
    it('saves the pause and goes back to the tournament', async () => {
        setNextGameDelay.mockResolvedValue(true);
        const res = await pause(post({ nextGameDelay: ' 45 ' }), params('4'));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/admin/tournaments/4?saved=1');
        expect(setNextGameDelay).toHaveBeenCalledWith({}, 4, 45);
    });

    it('refuses a pause out of bounds or missing, and changes nothing', async () => {
        for (const value of ['2', '121', '', '10.5', 'ten', undefined]) {
            const res = await pause(post(value === undefined ? {} : { nextGameDelay: value }), params('4'));
            expect(res.status).toBe(303);
            expect(res.headers.get('location')).toBe('/admin/tournaments/4?error=next-game-delay');
        }
        expect(setNextGameDelay).not.toHaveBeenCalled();
    });

    it('answers 404 for a bad or unknown tournament', async () => {
        expect((await pause(post({ nextGameDelay: '10' }), params('x'))).status).toBe(404);
        setNextGameDelay.mockResolvedValue(false);
        expect((await pause(post({ nextGameDelay: '10' }), params('9'))).status).toBe(404);
    });

    it('answers with the denial from requireAdminApi', async () => {
        const denied = Response.json({ error: 'forbidden' }, { status: 403 });
        requireAdminApi.mockResolvedValueOnce(denied);
        expect(await pause(post({ nextGameDelay: '10' }), params('4'))).toBe(denied);
        expect(setNextGameDelay).not.toHaveBeenCalled();
    });
});
