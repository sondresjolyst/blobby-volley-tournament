import { describe, expect, it } from 'vitest';
import { refuseGameServer } from './auth';

// A placeholder, not a real token.
const TOKEN = 'test-placeholder-token';
const env = { GAME_SERVER_TOKEN: TOKEN };
const req = (authorization?: string) => new Request('https://bvt.example.test/api/server/sync', { headers: authorization === undefined ? {} : { authorization } });

describe('refuseGameServer', () => {
    it('lets the right bearer token through', () => {
        expect(refuseGameServer(req(`Bearer ${TOKEN}`), env)).toBeNull();
        expect(refuseGameServer(req(`bearer ${TOKEN}`), env)).toBeNull();
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
    ])('answers 401 JSON for a %s token', async (_, authorization) => {
        const res = refuseGameServer(req(authorization), env)!;
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toBe('Bearer');
        expect(await res.json()).toEqual({ error: 'unauthorized' });
    });

    it.each([{}, { GAME_SERVER_TOKEN: '' }])('answers 503 when the token is not set, even for a request with a token', async (unset) => {
        for (const authorization of [undefined, `Bearer ${TOKEN}`, 'Bearer ']) {
            const res = refuseGameServer(req(authorization), unset)!;
            expect(res.status).toBe(503);
            expect(await res.json()).toEqual({ error: 'not-configured' });
        }
    });

    it('never puts the token in the answer', async () => {
        const res = refuseGameServer(req('Bearer test-placeholder-other'), env)!;
        expect(await res.text()).not.toContain(TOKEN);
    });
});
