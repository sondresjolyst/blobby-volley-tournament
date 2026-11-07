import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminApi = vi.fn();
const rotateBigScreenKey = vi.fn();

vi.mock('@/lib/auth/options', () => ({ requireAdminApi: (...args: unknown[]) => requireAdminApi(...args) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/events', () => ({ rotateBigScreenKey: (...args: unknown[]) => rotateBigScreenKey(...args) }));

import { POST as newKey } from './[id]/big-screen-key/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (fields: Record<string, string>) => new Request('https://bvt.example.test/api/admin/events/3/big-screen-key', { method: 'POST', body: new URLSearchParams(fields) });

beforeEach(() => {
    requireAdminApi.mockReset();
    rotateBigScreenKey.mockReset();
    requireAdminApi.mockResolvedValue({ githubId: '1' });
});

describe('POST /api/admin/events/{id}/big-screen-key', () => {
    it('makes a new key when the box is checked and goes back to the event', async () => {
        rotateBigScreenKey.mockResolvedValue(true);
        const res = await newKey(post({ confirm: 'yes' }), params('3'));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/admin/events/3?bigScreenKey=new#big-screen');
        expect(rotateBigScreenKey).toHaveBeenCalledWith({}, 3);
    });

    it('keeps the key when the box is not checked', async () => {
        for (const fields of [{}, { confirm: 'on' }, { confirm: '' }] as Record<string, string>[]) {
            const res = await newKey(post(fields), params('3'));
            expect(res.status).toBe(303);
            expect(res.headers.get('location')).toBe('/admin/events/3?error=bigScreenConfirm#big-screen');
        }
        expect(rotateBigScreenKey).not.toHaveBeenCalled();
    });

    it('answers 404 for a bad or unknown event', async () => {
        expect((await newKey(post({ confirm: 'yes' }), params('x'))).status).toBe(404);
        rotateBigScreenKey.mockResolvedValue(false);
        expect((await newKey(post({ confirm: 'yes' }), params('9'))).status).toBe(404);
    });

    it('answers with the denial from requireAdminApi, such as a cross-site post', async () => {
        const denied = Response.json({ error: 'forbidden' }, { status: 403 });
        requireAdminApi.mockResolvedValueOnce(denied);
        expect(await newKey(post({ confirm: 'yes' }), params('3'))).toBe(denied);
        expect(rotateBigScreenKey).not.toHaveBeenCalled();
    });
});
