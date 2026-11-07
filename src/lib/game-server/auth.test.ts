import { describe, expect, it } from 'vitest';
import { hashGameServerToken } from '@/lib/store/game-server-token';
import { checkGameServerToken, lastUseIsStale } from './auth';

// A placeholder, not a real token.
const TOKEN = 'test-placeholder-token';
const stored = hashGameServerToken(TOKEN);
const req = (authorization?: string) => new Request('https://bvt.example.test/api/server/sync', { headers: authorization === undefined ? {} : { authorization } });

describe('checkGameServerToken', () => {
    it('lets the right bearer token through', () => {
        expect(checkGameServerToken(req(`Bearer ${TOKEN}`), stored)).toBeNull();
        expect(checkGameServerToken(req(`bearer ${TOKEN}`), stored)).toBeNull();
    });

    it.each([
        ['missing', undefined],
        ['empty', ''],
        ['wrong', 'Bearer test-placeholder-other'],
        ['longer', `Bearer ${TOKEN}x`],
        ['shorter', `Bearer ${TOKEN.slice(0, -1)}`],
        ['bare', TOKEN],
        ['Basic', `Basic ${TOKEN}`],
        ['split', `Bearer ${TOKEN} x`],
        ['the hash itself', `Bearer ${stored.toString('hex')}`],
    ])('answers 401 JSON for a %s token', async (_, authorization) => {
        const res = checkGameServerToken(req(authorization), stored)!;
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toBe('Bearer');
        expect(await res.json()).toEqual({ error: 'unauthorized' });
    });

    it.each([null, new Uint8Array(), new Uint8Array(31)])('answers 503 when there is no token, even for a request with a token', async (unset) => {
        for (const authorization of [undefined, `Bearer ${TOKEN}`, 'Bearer ']) {
            const res = checkGameServerToken(req(authorization), unset)!;
            expect(res.status).toBe(503);
            expect(await res.json()).toEqual({ error: 'not-configured' });
        }
    });

    it('never puts the token in the answer', async () => {
        const res = checkGameServerToken(req('Bearer test-placeholder-other'), stored)!;
        expect(await res.text()).not.toContain(TOKEN);
    });
});

describe('lastUseIsStale', () => {
    it('is true when the token was never used or the last use is a minute old', () => {
        const now = new Date('2026-11-20T18:00:00Z');
        expect(lastUseIsStale({ lastUsedAt: null }, now)).toBe(true);
        expect(lastUseIsStale({ lastUsedAt: new Date('2026-11-20T17:59:00Z') }, now)).toBe(true);
        expect(lastUseIsStale({ lastUsedAt: new Date('2026-11-20T17:59:01Z') }, now)).toBe(false);
    });
});
