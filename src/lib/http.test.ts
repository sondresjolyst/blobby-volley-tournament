import { describe, expect, it, vi } from 'vitest';
import { isTrustedPost, parseId, readForm, readUploadForm, seeOther } from './http';

const requestHeaders = vi.hoisted(() => ({ current: null as Headers | null }));
vi.mock('next/headers', () => ({
    headers: async () => {
        if (!requestHeaders.current) throw new Error('outside a request');
        return requestHeaders.current;
    },
}));

describe('seeOther', () => {
    it('answers 303 with a relative address', async () => {
        requestHeaders.current = new Headers();
        const res = await seeOther('/me');
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/me');
    });

    it('answers a post sent in the background with the address as JSON', async () => {
        requestHeaders.current = new Headers({ 'x-background-post': '1' });
        const res = await seeOther('/me?bet=placed');
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        expect(await res.json()).toEqual({ location: '/me?bet=placed' });
    });

    it('answers 303 outside a request', async () => {
        requestHeaders.current = null;
        expect((await seeOther('/me')).status).toBe(303);
    });
});

describe('isTrustedPost', () => {
    const env = { NEXTAUTH_URL: 'https://bvt.example.test' };
    const req = (headers: Record<string, string>) => new Request('https://bvt.example.test/api/player/signin', { method: 'POST', headers });

    it.each(['same-origin', 'none'])('accepts Sec-Fetch-Site %s', (value) => {
        expect(isTrustedPost(req({ 'sec-fetch-site': value }), env)).toBe(true);
    });

    it.each(['cross-site', 'same-site', 'other'])('refuses Sec-Fetch-Site %s, even with a matching Origin', (value) => {
        expect(isTrustedPost(req({ 'sec-fetch-site': value, origin: 'https://bvt.example.test' }), env)).toBe(false);
    });

    it('without Sec-Fetch-Site accepts only an Origin that matches NEXTAUTH_URL', () => {
        expect(isTrustedPost(req({ origin: 'https://bvt.example.test' }), env)).toBe(true);
        expect(isTrustedPost(req({ origin: 'https://evil.test' }), env)).toBe(false);
        expect(isTrustedPost(req({ origin: 'http://bvt.example.test' }), env)).toBe(false);
        expect(isTrustedPost(req({ origin: 'null' }), env)).toBe(false);
    });

    it('refuses a post with neither header, or when NEXTAUTH_URL is not set', () => {
        expect(isTrustedPost(req({}), env)).toBe(false);
        expect(isTrustedPost(req({ origin: 'https://bvt.example.test' }), {})).toBe(false);
        expect(isTrustedPost(req({ origin: 'https://bvt.example.test' }), { NEXTAUTH_URL: 'not a url' })).toBe(false);
    });
});

describe('readForm', () => {
    it('keeps the first value of each field', async () => {
        const body = new URLSearchParams([
            ['a', '1'],
            ['a', '2'],
            ['b', 'x'],
        ]);
        expect(await readForm(new Request('https://bvt.example.test/', { method: 'POST', body }))).toEqual({ a: '1', b: 'x' });
    });

    it('returns no fields for a body that is not a form', async () => {
        expect(await readForm(new Request('https://bvt.example.test/', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))).toEqual({});
    });
});

describe('parseId', () => {
    it.each([
        ['1', 1],
        ['2147483647', 2147483647],
        ['0', null],
        ['01', null],
        ['-1', null],
        ['1.5', null],
        ['2147483648', null],
        ['abc', null],
    ])('reads %s as %s', (value, expected) => {
        expect(parseId(value)).toBe(expected);
    });
});

describe('readUploadForm', () => {
    async function upload(form: FormData, headers: Record<string, string> = {}): Promise<Request> {
        const encoded = new Response(form);
        return new Request('https://bvt.example.test/', { method: 'POST', body: await encoded.arrayBuffer(), headers: { 'content-type': encoded.headers.get('content-type')!, ...headers } });
    }

    it('reads the text fields and the bytes of each file, the first value of each', async () => {
        const form = new FormData();
        form.append('name', 'Acme');
        form.append('name', 'Other');
        form.append('logo', new Blob([new Uint8Array([1, 2, 3])]), 'a.png');
        form.append('empty', new Blob([]), 'b.png');
        expect(await readUploadForm(await upload(form), 1000)).toEqual({ fields: { name: 'Acme' }, files: { logo: new Uint8Array([1, 2, 3]) } });
    });

    it('refuses a body over the limit, by its content-length or as it arrives', async () => {
        const form = new FormData();
        form.append('logo', new Blob([new Uint8Array(2000)]), 'a.png');
        expect(await readUploadForm(await upload(form), 1000)).toBe('too-large');
        expect(await readUploadForm(await upload(new FormData(), { 'content-length': '1001' }), 1000)).toBe('too-large');
    });

    it('returns no fields for a body that is not a form', async () => {
        expect(await readUploadForm(new Request('https://bvt.example.test/', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), 1000)).toEqual({ fields: {}, files: {} });
    });
});
