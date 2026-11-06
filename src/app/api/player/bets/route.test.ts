import { beforeEach, describe, expect, it, vi } from 'vitest';

const getActivePlayer = vi.fn();
const placeBet = vi.fn();
const listPlayerBets = vi.fn();
const getBalance = vi.fn();

vi.mock('@/lib/players/current', () => ({ getActivePlayer: () => getActivePlayer() }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/bets', () => ({ placeBet: (...args: unknown[]) => placeBet(...args), listPlayerBets: (...args: unknown[]) => listPlayerBets(...args) }));
vi.mock('@/lib/store/foza', () => ({ getBalance: (...args: unknown[]) => getBalance(...args) }));

import { GET as getBalanceRoute } from '../balance/route';
import { GET, POST } from './route';

const post = (headers: Record<string, string>) =>
    new Request('https://bvt.example.test/api/player/bets', { method: 'POST', headers, body: new URLSearchParams({ matchId: '1', on: '2', amount: '10' }) });

beforeEach(() => {
    getActivePlayer.mockReset();
    placeBet.mockReset();
    listPlayerBets.mockReset();
    getBalance.mockReset();
});

describe('POST /api/player/bets', () => {
    it('refuses a cross-site post before it looks at the session', async () => {
        const res = await POST(post({ 'sec-fetch-site': 'cross-site' }));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/me?error=form');
        expect(getActivePlayer).not.toHaveBeenCalled();
        expect(placeBet).not.toHaveBeenCalled();
    });

    it('sends a signed out browser to sign-in with a 303, so the form is not sent again', async () => {
        getActivePlayer.mockResolvedValue(null);
        const res = await POST(post({ 'sec-fetch-site': 'same-origin' }));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/login');
        expect(placeBet).not.toHaveBeenCalled();
    });

    it('places the bet for the signed in player and sends the refusal code back', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        placeBet.mockResolvedValueOnce({ ok: true, raised: false }).mockResolvedValueOnce({ ok: false, error: 'closed' });
        const placed = await POST(post({ 'sec-fetch-site': 'same-origin' }));
        expect(placed.headers.get('location')).toBe('/me?bet=placed');
        expect(placeBet).toHaveBeenCalledWith({}, 5, { matchId: 1, onPlayerId: 2, amount: 10 }, expect.any(Date));
        const refused = await POST(post({ 'sec-fetch-site': 'same-origin' }));
        expect(refused.headers.get('location')).toBe('/me?error=closed');
    });
});

describe('GET /api/player/bets and /api/player/balance', () => {
    it('answer 401 JSON when signed out, without reading the store', async () => {
        getActivePlayer.mockResolvedValue(null);
        for (const res of [await GET(), await getBalanceRoute()]) {
            expect(res.status).toBe(401);
            expect(await res.json()).toEqual({ error: 'unauthorized' });
        }
        expect(listPlayerBets).not.toHaveBeenCalled();
        expect(getBalance).not.toHaveBeenCalled();
    });

    it('answer with the data of the signed in player', async () => {
        getActivePlayer.mockResolvedValue({ id: 5 });
        listPlayerBets.mockResolvedValue([]);
        getBalance.mockResolvedValue(1100);
        expect(await (await GET()).json()).toEqual({ bets: [] });
        expect(await (await getBalanceRoute()).json()).toEqual({ balance: 1100 });
        expect(listPlayerBets).toHaveBeenCalledWith({}, 5);
        expect(getBalance).toHaveBeenCalledWith({}, 5, expect.any(Date));
    });
});
