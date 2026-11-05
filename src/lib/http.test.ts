import { describe, expect, it } from 'vitest';
import { isTrustedPost, parseId, readForm, seeOther } from './http';

describe('seeOther', () => {
    it('answers 303 with a relative address', () => {
        const res = seeOther('/me');
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/me');
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
