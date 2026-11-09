import { beforeEach, describe, expect, it, vi } from 'vitest';

const getActivePlayer = vi.fn();
const createChallenge = vi.fn();
const acceptChallenge = vi.fn();
const declineChallenge = vi.fn();
const withdrawChallenge = vi.fn();

vi.mock('@/lib/players/current', () => ({ getActivePlayer: () => getActivePlayer() }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/matches', () => ({
    createChallenge: (...args: unknown[]) => createChallenge(...args),
    acceptChallenge: (...args: unknown[]) => acceptChallenge(...args),
    declineChallenge: (...args: unknown[]) => declineChallenge(...args),
    withdrawChallenge: (...args: unknown[]) => withdrawChallenge(...args),
}));

import { POST as answer } from './[id]/route';
import { POST as create } from './route';

const post = (path: string, headers: Record<string, string>, form: Record<string, string>) =>
    new Request(`https://bvt.example.test${path}`, { method: 'POST', headers, body: new URLSearchParams(form) });
const sameSite = { 'sec-fetch-site': 'same-origin' };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    for (const fn of [getActivePlayer, createChallenge, acceptChallenge, declineChallenge, withdrawChallenge]) fn.mockReset();
});

describe('POST /api/player/challenges', () => {
    it('refuses a cross-site post before it looks at the session', async () => {
        const res = await create(post('/api/player/challenges', { 'sec-fetch-site': 'cross-site' }, { opponent: '2' }));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/me?challengeError=form#utfordringa');
        expect(getActivePlayer).not.toHaveBeenCalled();
        expect(createChallenge).not.toHaveBeenCalled();
    });

    it('sends a signed out browser to sign-in', async () => {
        getActivePlayer.mockResolvedValue(null);
        const res = await create(post('/api/player/challenges', sameSite, { opponent: '2' }));
        expect(res.headers.get('location')).toBe('/login');
        expect(createChallenge).not.toHaveBeenCalled();
    });

    it('asks for the match as the signed in player with the chosen settings', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        createChallenge.mockResolvedValueOnce({ ok: true, matchId: 9 }).mockResolvedValueOnce({ ok: false, error: 'taken' });
        const sent = await create(post('/api/player/challenges', sameSite, { opponent: '2', bestOf: '3', ruleFile: 'tennis.lua', scoreToWin: '21', speed: '90' }));
        expect(sent.headers.get('location')).toBe('/me?challenge=sent#utfordringa');
        expect(createChallenge).toHaveBeenCalledWith({}, 5, 2, { bestOf: 3, ruleFile: 'tennis.lua', scoreToWin: 21, speed: 90 });
        const taken = await create(post('/api/player/challenges', sameSite, { opponent: '2' }));
        expect(taken.headers.get('location')).toBe('/me?challengeError=taken#utfordringa');
        expect(createChallenge).toHaveBeenLastCalledWith({}, 5, 2, { bestOf: 1, ruleFile: 'default.lua', scoreToWin: 15, speed: 75 });
    });

    it('refuses settings out of bounds without asking the store', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        const res = await create(post('/api/player/challenges', sameSite, { opponent: '2', speed: '500' }));
        expect(res.headers.get('location')).toBe('/me?challengeError=form#utfordringa');
        const rules = await create(post('/api/player/challenges', sameSite, { opponent: '2', ruleFile: 'fun.lua' }));
        expect(rules.headers.get('location')).toBe('/me?challengeError=form#utfordringa');
        expect(createChallenge).not.toHaveBeenCalled();
    });
});

describe('POST /api/player/challenges/[id]', () => {
    it('refuses a cross-site post and sends a signed out browser to sign-in', async () => {
        const cross = await answer(post('/api/player/challenges/9', { 'sec-fetch-site': 'cross-site' }, { answer: 'accept' }), params('9'));
        expect(cross.headers.get('location')).toBe('/me?challengeError=form#utfordringa');
        expect(getActivePlayer).not.toHaveBeenCalled();
        getActivePlayer.mockResolvedValue(null);
        const signedOut = await answer(post('/api/player/challenges/9', sameSite, { answer: 'accept' }), params('9'));
        expect(signedOut.headers.get('location')).toBe('/login');
        expect(acceptChallenge).not.toHaveBeenCalled();
    });

    it('accepts or declines as the signed in player and passes refusals on', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        acceptChallenge
            .mockResolvedValueOnce({ ok: true, events: [], called: true })
            .mockResolvedValueOnce({ ok: true, events: [], called: false })
            .mockResolvedValueOnce({ ok: false, error: 'not-allowed' });
        declineChallenge.mockResolvedValueOnce({ ok: true, events: [] });
        const accepted = await answer(post('/api/player/challenges/9', sameSite, { answer: 'accept' }), params('9'));
        expect(accepted.headers.get('location')).toBe('/me?challenge=accepted#utfordringa');
        expect(acceptChallenge).toHaveBeenCalledWith({}, 9, 5);
        const queued = await answer(post('/api/player/challenges/9', sameSite, { answer: 'accept' }), params('9'));
        expect(queued.headers.get('location')).toBe('/me?challenge=queued#utfordringa');
        const refused = await answer(post('/api/player/challenges/9', sameSite, { answer: 'accept' }), params('9'));
        expect(refused.headers.get('location')).toBe('/me?challengeError=not-allowed#utfordringa');
        const declined = await answer(post('/api/player/challenges/9', sameSite, { answer: 'decline' }), params('9'));
        expect(declined.headers.get('location')).toBe('/me?challenge=declined#utfordringa');
        expect(declineChallenge).toHaveBeenCalledWith({}, 9, 5);
    });

    it('withdraws as the signed in player and passes refusals on', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        withdrawChallenge.mockResolvedValueOnce({ ok: true, events: [] }).mockResolvedValueOnce({ ok: false, error: 'state' });
        const withdrawn = await answer(post('/api/player/challenges/9', sameSite, { answer: 'withdraw' }), params('9'));
        expect(withdrawn.headers.get('location')).toBe('/me?challenge=withdrawn#utfordringa');
        expect(withdrawChallenge).toHaveBeenCalledWith({}, 9, 5);
        const late = await answer(post('/api/player/challenges/9', sameSite, { answer: 'withdraw' }), params('9'));
        expect(late.headers.get('location')).toBe('/me?challengeError=state#utfordringa');
        expect(acceptChallenge).not.toHaveBeenCalled();
        expect(declineChallenge).not.toHaveBeenCalled();
    });

    it('refuses a bad id or answer without asking the store', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        for (const [id, form] of [
            ['x', { answer: 'accept' }],
            ['9', { answer: 'cancel' }],
        ] as const) {
            const res = await answer(post(`/api/player/challenges/${id}`, sameSite, form), params(id));
            expect(res.headers.get('location')).toBe('/me?challengeError=form#utfordringa');
        }
        expect(acceptChallenge).not.toHaveBeenCalled();
        expect(declineChallenge).not.toHaveBeenCalled();
        expect(withdrawChallenge).not.toHaveBeenCalled();
    });
});
