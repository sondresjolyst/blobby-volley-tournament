import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminPost = vi.fn();
const rotateBigScreenKey = vi.fn();
const setBigScreenRotation = vi.fn();

vi.mock('@/lib/auth/options', () => ({ requireAdminPost: (...args: unknown[]) => requireAdminPost(...args) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/events', () => ({
    rotateBigScreenKey: (...args: unknown[]) => rotateBigScreenKey(...args),
    setBigScreenRotation: (...args: unknown[]) => setBigScreenRotation(...args),
}));

import { POST as newKey } from './[id]/big-screen-key/route';
import { POST as saveRotation } from './[id]/big-screen-rotation/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (fields: Record<string, string>) => new Request('https://bvt.example.test/api/admin/events/3/big-screen-key', { method: 'POST', body: new URLSearchParams(fields) });

beforeEach(() => {
    requireAdminPost.mockReset();
    rotateBigScreenKey.mockReset();
    setBigScreenRotation.mockReset();
    requireAdminPost.mockResolvedValue({ githubId: '1' });
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

    it('answers with the denial from requireAdminPost, such as a cross-site post', async () => {
        const denied = Response.json({ error: 'forbidden' }, { status: 403 });
        requireAdminPost.mockResolvedValueOnce(denied);
        expect(await newKey(post({ confirm: 'yes' }), params('3'))).toBe(denied);
        expect(rotateBigScreenKey).not.toHaveBeenCalled();
    });
});

describe('POST /api/admin/events/{id}/big-screen-rotation', () => {
    const rotation = (fields: Record<string, string>) => new Request('https://bvt.example.test/api/admin/events/3/big-screen-rotation', { method: 'POST', body: new URLSearchParams(fields) });

    it('saves the screens in order and the time, and goes back to the form', async () => {
        setBigScreenRotation.mockResolvedValue(true);
        const res = await saveRotation(rotation({ show_overview: 'on', order_overview: '2', show_bracket: 'on', order_bracket: '1', seconds: '30' }), params('3'));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/admin/events/3?rotationSaved=1#big-screen-rotation');
        expect(setBigScreenRotation).toHaveBeenCalledWith({}, 3, { screens: ['bracket', 'overview'], seconds: 30 });
    });

    it('sends the form back with an error for no screens or a time out of bounds', async () => {
        const none = await saveRotation(rotation({ seconds: '60' }), params('3'));
        expect(none.headers.get('location')).toBe('/admin/events/3?error=bigScreenNone#big-screen-rotation');
        const slow = await saveRotation(rotation({ show_overview: 'on', seconds: '601' }), params('3'));
        expect(slow.headers.get('location')).toBe('/admin/events/3?error=bigScreenSeconds#big-screen-rotation');
        expect(setBigScreenRotation).not.toHaveBeenCalled();
    });

    it('answers 404 for a bad or unknown event', async () => {
        expect((await saveRotation(rotation({ show_overview: 'on', seconds: '60' }), params('x'))).status).toBe(404);
        setBigScreenRotation.mockResolvedValue(false);
        expect((await saveRotation(rotation({ show_overview: 'on', seconds: '60' }), params('9'))).status).toBe(404);
    });
});
