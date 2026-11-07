import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BMP_HEADER_BYTES, readBmpInfo } from '@/lib/sponsors/bmp';

const requireAdminPost = vi.fn();
const createSponsor = vi.fn();
const updateSponsor = vi.fn();
const moveSponsor = vi.fn();
const deleteSponsor = vi.fn();
const getSponsorLogo = vi.fn();
const setGameBoard = vi.fn();

vi.mock('@/lib/auth/options', () => ({
    requireAdminPost: (...args: unknown[]) => requireAdminPost(...args),
    requireAdminRead: (...args: unknown[]) => requireAdminPost(...args),
}));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/sponsors', () => ({
    createSponsor: (...args: unknown[]) => createSponsor(...args),
    updateSponsor: (...args: unknown[]) => updateSponsor(...args),
    moveSponsor: (...args: unknown[]) => moveSponsor(...args),
    deleteSponsor: (...args: unknown[]) => deleteSponsor(...args),
    getSponsorLogo: (...args: unknown[]) => getSponsorLogo(...args),
}));
vi.mock('@/lib/store/events', () => ({ setGameBoard: (...args: unknown[]) => setGameBoard(...args) }));

import { POST as gameBoard } from '../events/[id]/game-board/route';
import { POST as create } from '../events/[id]/sponsors/route';
import { POST as remove } from './[id]/delete/route';
import { GET as adminLogo } from './[id]/logo/route';
import { POST as move } from './[id]/move/route';
import { POST as update } from './[id]/route';
import { GET as publicLogo } from '../../sponsors/[id]/logo/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
let logo: Uint8Array;

beforeAll(async () => {
    logo = new Uint8Array(await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
});

beforeEach(() => {
    for (const mock of [requireAdminPost, createSponsor, updateSponsor, moveSponsor, deleteSponsor, getSponsorLogo, setGameBoard]) mock.mockReset();
    requireAdminPost.mockResolvedValue({ githubId: '1' });
});

function form(fields: Record<string, string>, file?: { bytes: Uint8Array; type: string; name: string }) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    if (file) body.set('logo', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    return body;
}

const post = (path: string, body: URLSearchParams) => new Request(`https://bvt.example.test${path}`, { method: 'POST', body });

/**
 * A multipart post with the body as bytes. The stream undici makes from a FormData fails when
 * a reader stops early, as the size cap does. A browser post arrives as plain bytes anyway.
 */
async function upload(path: string, body: FormData): Promise<Request> {
    const encoded = new Response(body);
    return new Request(`https://bvt.example.test${path}`, { method: 'POST', body: await encoded.arrayBuffer(), headers: { 'content-type': encoded.headers.get('content-type')! } });
}
const fields = { name: 'Acme', link: 'https://acme.example.test', ownBackground: 'on', gameBackground: '#000000', enabled: 'on' };
const stored = () => ({ bytes: logo, type: 'image/png', hash: 'f'.repeat(64), width: 300, height: 100, eventId: 3, enabled: true, eventActive: true });

describe('POST /api/admin/events/{id}/sponsors', () => {
    const add = async (body: FormData) => create(await upload('/api/admin/events/3/sponsors', body), params('3'));

    it('stores the logo and a 96 by 32 game logo with alpha, and goes back to the event', async () => {
        createSponsor.mockResolvedValue({ ok: true, id: 9 });
        const res = await add(form(fields, { bytes: logo, type: 'image/png', name: 'acme.png' }));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/admin/events/3?sponsor=9#sponsors');
        const [, eventId, input, checked, gameLogo] = createSponsor.mock.calls[0];
        expect(eventId).toBe(3);
        expect(input).toEqual({ name: 'Acme', link: 'https://acme.example.test/', enabled: true, gameBackground: '#000000' });
        expect(checked).toMatchObject({ type: 'image/png', width: 300, height: 100 });
        expect(readBmpInfo(gameLogo)).toEqual({ width: 96, height: 32, bitsPerPixel: 32 });
    });

    it('keeps the game logo transparent when the own background box is not checked', async () => {
        createSponsor.mockResolvedValue({ ok: true, id: 9 });
        await add(form({ ...fields, ownBackground: '' }, { bytes: logo, type: 'image/png', name: 'acme.png' }));
        const [, , input, , gameLogo] = createSponsor.mock.calls[0];
        expect(input).toMatchObject({ gameBackground: null });
        // The uploaded logo is fully transparent.
        expect(gameLogo[BMP_HEADER_BYTES + 3]).toBe(0);
    });

    it.each([
        ['logo-missing', form(fields)],
        ['sponsor-name', form({ ...fields, name: '' }, { bytes: logo, type: 'image/png', name: 'a.png' })],
        ['sponsor-link', form({ ...fields, link: 'javascript:alert(1)' }, { bytes: logo, type: 'image/png', name: 'a.png' })],
        ['logo-type', form(fields, { bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), type: 'image/png', name: 'a.png' })],
        ['logo-size', form(fields, { bytes: new Uint8Array(1024 * 1024 + 20 * 1024), type: 'image/png', name: 'a.png' })],
    ])('sends %s back without storing anything', async (error, body) => {
        const res = await add(body);
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe(`/admin/events/3?error=${error}#sponsors`);
        expect(createSponsor).not.toHaveBeenCalled();
    });

    it('says when the event has too many sponsors, and answers 404 for no event', async () => {
        createSponsor.mockResolvedValueOnce({ ok: false, error: 'limit' }).mockResolvedValueOnce({ ok: false, error: 'not-found' });
        expect((await add(form(fields, { bytes: logo, type: 'image/png', name: 'a.png' }))).headers.get('location')).toBe('/admin/events/3?error=sponsor-limit#sponsors');
        expect((await add(form(fields, { bytes: logo, type: 'image/png', name: 'a.png' }))).status).toBe(404);
    });
});

describe('POST /api/admin/sponsors/{id}', () => {
    const save = async (body: FormData, id = '9') => update(await upload(`/api/admin/sponsors/${id}`, body), params(id));

    it('keeps the stored logo without a new file, and makes the game logo again for the new background', async () => {
        getSponsorLogo.mockResolvedValue(stored());
        updateSponsor.mockResolvedValue(3);
        const res = await save(form({ name: 'Acme', ownBackground: 'on', gameBackground: '#ff0000' }));
        expect(res.headers.get('location')).toBe('/admin/events/3?sponsor=9#sponsors');
        const [, id, input, newLogo, gameLogo] = updateSponsor.mock.calls[0];
        expect(id).toBe(9);
        expect(input).toEqual({ name: 'Acme', link: null, enabled: false, gameBackground: '#ff0000' });
        expect(newLogo).toBeNull();
        // The stored logo is transparent, so the game logo is all background, opaque.
        expect(Array.from(gameLogo.slice(BMP_HEADER_BYTES, BMP_HEADER_BYTES + 4))).toEqual([0, 0, 255, 255]);
    });

    it('replaces the logo with a new file', async () => {
        getSponsorLogo.mockResolvedValue(stored());
        updateSponsor.mockResolvedValue(3);
        const square = new Uint8Array(await sharp({ create: { width: 50, height: 50, channels: 3, background: '#00ff00' } }).jpeg().toBuffer());
        await save(form(fields, { bytes: square, type: 'image/jpeg', name: 'new.jpg' }));
        const [, , , newLogo, gameLogo] = updateSponsor.mock.calls[0];
        expect(newLogo).toMatchObject({ type: 'image/jpeg', width: 50, height: 50 });
        expect(readBmpInfo(gameLogo)).toEqual({ width: 32, height: 32, bitsPerPixel: 32 });
    });

    it('sends a bad form back to the event of the sponsor, and answers 404 for no sponsor', async () => {
        getSponsorLogo.mockResolvedValueOnce(stored()).mockResolvedValueOnce(null);
        expect((await save(form({ ...fields, gameBackground: 'red' }))).headers.get('location')).toBe('/admin/events/3?error=sponsor-background#sponsors');
        expect((await save(form(fields))).status).toBe(404);
        expect((await save(form(fields), 'x')).status).toBe(404);
        expect(updateSponsor).not.toHaveBeenCalled();
    });
});

describe('POST /api/admin/sponsors/{id}/move and /delete', () => {
    it('moves up or down and goes back to the list', async () => {
        moveSponsor.mockResolvedValue(3);
        const res = await move(post('/api/admin/sponsors/9/move', new URLSearchParams({ direction: 'down' })), params('9'));
        expect(res.headers.get('location')).toBe('/admin/events/3#sponsors');
        expect(moveSponsor).toHaveBeenCalledWith({}, 9, 'down');
    });

    it('answers 400 for another direction and 404 for no sponsor', async () => {
        expect((await move(post('/api/admin/sponsors/9/move', new URLSearchParams({ direction: 'left' })), params('9'))).status).toBe(400);
        moveSponsor.mockResolvedValue(null);
        expect((await move(post('/api/admin/sponsors/9/move', new URLSearchParams({ direction: 'up' })), params('9'))).status).toBe(404);
    });

    it('deletes and says so', async () => {
        deleteSponsor.mockResolvedValueOnce(3).mockResolvedValueOnce(null);
        expect((await remove(post('/api/admin/sponsors/9/delete', new URLSearchParams()), params('9'))).headers.get('location')).toBe('/admin/events/3?sponsorDeleted=1#sponsors');
        expect((await remove(post('/api/admin/sponsors/9/delete', new URLSearchParams()), params('9'))).status).toBe(404);
    });
});

describe('POST /api/admin/events/{id}/game-board', () => {
    const save = (board: string, id = '3') => gameBoard(post(`/api/admin/events/${id}/game-board`, new URLSearchParams({ gameBoard: board })), params(id));

    it.each(['off', 'led', 'printed', 'wood', 'slim', 'padded'])('stores %s and goes back to the sponsors', async (board) => {
        setGameBoard.mockResolvedValue(true);
        const res = await save(board);
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/admin/events/3?boardSaved=1#sponsors');
        expect(setGameBoard).toHaveBeenCalledWith({}, 3, board);
    });

    it('answers 400 for another style and 404 for no event', async () => {
        expect((await save('neon')).status).toBe(400);
        expect((await gameBoard(post('/api/admin/events/3/game-board', new URLSearchParams()), params('3'))).status).toBe(400);
        expect(setGameBoard).not.toHaveBeenCalled();
        setGameBoard.mockResolvedValue(false);
        expect((await save('led')).status).toBe(404);
        expect((await save('led', 'x')).status).toBe(404);
    });
});

describe('logo routes', () => {
    const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://bvt.example.test${path}`, { headers });

    it('serve the logo with its type, nosniff and an ETag', async () => {
        getSponsorLogo.mockResolvedValue(stored());
        for (const res of [await adminLogo(get('/api/admin/sponsors/9/logo'), params('9')), await publicLogo(get('/api/sponsors/9/logo'), params('9'))]) {
            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toBe('image/png');
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            expect(res.headers.get('etag')).toBe(`"${'f'.repeat(64)}"`);
            expect(new Uint8Array(await res.arrayBuffer())).toEqual(logo);
        }
    });

    it('let the public route be cached for a year only at the address with the hash', async () => {
        getSponsorLogo.mockResolvedValue(stored());
        expect((await publicLogo(get(`/api/sponsors/9/logo?v=${'f'.repeat(64)}`), params('9'))).headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect((await publicLogo(get('/api/sponsors/9/logo?v=old'), params('9'))).headers.get('cache-control')).toBe('public, no-cache');
        expect((await adminLogo(get('/api/admin/sponsors/9/logo'), params('9'))).headers.get('cache-control')).toBe('private, no-cache');
    });

    it('answer 304 when the browser has the logo', async () => {
        getSponsorLogo.mockResolvedValue(stored());
        const res = await publicLogo(get('/api/sponsors/9/logo', { 'if-none-match': `"${'f'.repeat(64)}"` }), params('9'));
        expect(res.status).toBe(304);
        expect(res.body).toBeNull();
    });

    it('keep the public route to enabled sponsors of the active event', async () => {
        for (const hidden of [{ enabled: false }, { eventActive: false }]) {
            getSponsorLogo.mockResolvedValueOnce({ ...stored(), ...hidden });
            expect((await publicLogo(get('/api/sponsors/9/logo'), params('9'))).status).toBe(404);
        }
        getSponsorLogo.mockResolvedValueOnce({ ...stored(), enabled: false });
        expect((await adminLogo(get('/api/admin/sponsors/9/logo'), params('9'))).status).toBe(200);
        getSponsorLogo.mockResolvedValue(null);
        expect((await publicLogo(get('/api/sponsors/9/logo'), params('9'))).status).toBe(404);
        expect((await publicLogo(get('/api/sponsors/x/logo'), params('x'))).status).toBe(404);
    });
});
