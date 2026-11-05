import { describe, expect, it } from 'vitest';
import { isCrossSite, parseId, readForm, seeOther } from './http';

describe('seeOther', () => {
    it('answers 303 with a relative address', () => {
        const res = seeOther('/me');
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/me');
    });
});

describe('isCrossSite', () => {
    it('is true only when the browser says the post came from another site', () => {
        const req = (value?: string) => new Request('https://bvt.example.test/', { headers: value ? { 'sec-fetch-site': value } : {} });
        expect(isCrossSite(req('cross-site'))).toBe(true);
        expect(isCrossSite(req('same-origin'))).toBe(false);
        expect(isCrossSite(req())).toBe(false);
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
