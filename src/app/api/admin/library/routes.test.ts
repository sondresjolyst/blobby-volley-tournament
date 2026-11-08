import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBmpInfo } from '@/lib/sponsors/bmp';

const requireAdminPost = vi.fn();
const addFromLibrary = vi.fn();
const createLibrarySponsor = vi.fn();
const updateLibrarySponsor = vi.fn();
const deleteLibrarySponsor = vi.fn();
const getLibraryLogo = vi.fn();

vi.mock('@/lib/auth/options', () => ({
    requireAdminPost: (...args: unknown[]) => requireAdminPost(...args),
    requireAdminRead: (...args: unknown[]) => requireAdminPost(...args),
}));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/sponsors', () => ({
    addFromLibrary: (...args: unknown[]) => addFromLibrary(...args),
    createLibrarySponsor: (...args: unknown[]) => createLibrarySponsor(...args),
    updateLibrarySponsor: (...args: unknown[]) => updateLibrarySponsor(...args),
    deleteLibrarySponsor: (...args: unknown[]) => deleteLibrarySponsor(...args),
    getLibraryLogo: (...args: unknown[]) => getLibraryLogo(...args),
}));

import { POST as importSponsor } from '../events/[id]/sponsors/library/route';
import { POST as remove } from './[id]/delete/route';
import { GET as logoRoute } from './[id]/logo/route';
import { POST as update } from './[id]/route';
import { POST as create } from './route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });
let logo: Uint8Array;

beforeAll(async () => {
    logo = new Uint8Array(await sharp({ create: { width: 300, height: 100, channels: 4, background: '#ff0000' } }).png().toBuffer());
});

beforeEach(() => {
    for (const mock of [requireAdminPost, addFromLibrary, createLibrarySponsor, updateLibrarySponsor, deleteLibrarySponsor, getLibraryLogo]) mock.mockReset();
    requireAdminPost.mockResolvedValue({ githubId: '1' });
});

const post = (path: string, body: URLSearchParams) => new Request(`https://bvt.example.test${path}`, { method: 'POST', body });

async function upload(path: string, fields: Record<string, string>, file?: Uint8Array): Promise<Request> {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    if (file) body.set('logo', new Blob([new Uint8Array(file)], { type: 'image/png' }), 'logo.png');
    const encoded = new Response(body);
    return new Request(`https://bvt.example.test${path}`, { method: 'POST', body: await encoded.arrayBuffer(), headers: { 'content-type': encoded.headers.get('content-type')! } });
}

const fields = { name: 'Acme', link: '', ownBackground: 'off', gameBackground: '#ffffff' };

describe('POST /api/admin/events/{id}/sponsors/library', () => {
    it('puts the picked library sponsor on the event and goes back to it', async () => {
        addFromLibrary.mockResolvedValue({ ok: true, id: 12 });
        const res = await importSponsor(post('/api/admin/events/3/sponsors/library', new URLSearchParams({ libraryId: '7' })), params('3'));
        expect(res.headers.get('location')).toBe('/admin/events/3?sponsor=12#sponsors');
        expect(addFromLibrary.mock.calls[0].slice(1)).toEqual([3, 7]);
    });

    it('says when nothing is picked, the event has it or is full, and answers 404 for no event', async () => {
        const send = (libraryId: string) => importSponsor(post('/api/admin/events/3/sponsors/library', new URLSearchParams({ libraryId })), params('3'));
        expect((await send('')).headers.get('location')).toBe('/admin/events/3?error=library-pick#sponsors');
        expect(addFromLibrary).not.toHaveBeenCalled();
        addFromLibrary.mockResolvedValueOnce({ ok: false, error: 'taken' }).mockResolvedValueOnce({ ok: false, error: 'limit' }).mockResolvedValueOnce({ ok: false, error: 'not-found' });
        expect((await send('7')).headers.get('location')).toBe('/admin/events/3?error=sponsor-taken#sponsors');
        expect((await send('7')).headers.get('location')).toBe('/admin/events/3?error=sponsor-limit#sponsors');
        expect((await send('7')).status).toBe(404);
    });
});

describe('the library routes', () => {
    it('add a sponsor with its game logo, and refuse one without a logo', async () => {
        createLibrarySponsor.mockResolvedValue({ ok: true, id: 4 });
        const res = await create(await upload('/api/admin/library', fields, logo));
        expect(res.headers.get('location')).toBe('/admin/sponsors?saved=4');
        const [, input, , gameLogo] = createLibrarySponsor.mock.calls[0];
        expect(input).toMatchObject({ name: 'Acme', gameBackground: null });
        expect(readBmpInfo(gameLogo)?.bitsPerPixel).toBe(32);
        expect((await create(await upload('/api/admin/library', fields))).headers.get('location')).toBe('/admin/sponsors?error=logo-missing');
        createLibrarySponsor.mockResolvedValue({ ok: false, error: 'limit' });
        expect((await create(await upload('/api/admin/library', fields, logo))).headers.get('location')).toBe('/admin/sponsors?error=library-limit');
    });

    it('save a sponsor from its stored logo when no file is sent, and answer 404 for no sponsor', async () => {
        getLibraryLogo.mockResolvedValue({ bytes: logo, type: 'image/png', hash: 'f'.repeat(64), width: 300, height: 100 });
        updateLibrarySponsor.mockResolvedValue(true);
        const res = await update(await upload('/api/admin/library/4', { ...fields, ownBackground: 'on', gameBackground: '#00ff00' }), params('4'));
        expect(res.headers.get('location')).toBe('/admin/sponsors?saved=4');
        const [, id, input, newLogo] = updateLibrarySponsor.mock.calls[0];
        expect([id, input.gameBackground, newLogo]).toEqual([4, '#00ff00', null]);
        getLibraryLogo.mockResolvedValue(null);
        expect((await update(await upload('/api/admin/library/5', fields), params('5'))).status).toBe(404);
    });

    it('delete only a sponsor no event uses', async () => {
        const send = () => remove(post('/api/admin/library/4/delete', new URLSearchParams()), params('4'));
        deleteLibrarySponsor.mockResolvedValueOnce('deleted').mockResolvedValueOnce('in-use').mockResolvedValueOnce('not-found');
        expect((await send()).headers.get('location')).toBe('/admin/sponsors?deleted=1');
        expect((await send()).headers.get('location')).toBe('/admin/sponsors?error=library-in-use');
        expect((await send()).status).toBe(404);
    });

    it('serve the logo to an admin, never cached in public', async () => {
        getLibraryLogo.mockResolvedValue({ bytes: logo, type: 'image/png', hash: 'a'.repeat(64), width: 300, height: 100 });
        const res = await logoRoute(new Request('https://bvt.example.test/api/admin/library/4/logo'), params('4'));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('private, no-cache');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('stop at the admin check before anything else', async () => {
        requireAdminPost.mockResolvedValue(new Response(null, { status: 403 }));
        expect((await create(await upload('/api/admin/library', fields, logo))).status).toBe(403);
        expect((await logoRoute(new Request('https://bvt.example.test/api/admin/library/4/logo'), params('4'))).status).toBe(403);
        expect(createLibrarySponsor).not.toHaveBeenCalled();
        expect(getLibraryLogo).not.toHaveBeenCalled();
    });
});
