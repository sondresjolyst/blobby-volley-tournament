import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireActivePlayer = vi.fn();
const placeBet = vi.fn();

vi.mock('@/lib/players/current', () => ({ requireActivePlayer: () => requireActivePlayer() }));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/bets', () => ({ placeBet: (...args: unknown[]) => placeBet(...args), listPlayerBets: async () => [] }));

import { POST } from './route';

const post = (headers: Record<string, string>) =>
    new Request('https://bvt.example.test/api/player/bets', { method: 'POST', headers, body: new URLSearchParams({ matchId: '1', on: '2', amount: '10' }) });

beforeEach(() => {
    requireActivePlayer.mockReset();
    placeBet.mockReset();
});

describe('POST /api/player/bets', () => {
    it('refuses a cross-site post before it looks at the session', async () => {
        const res = await POST(post({ 'sec-fetch-site': 'cross-site' }));
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/me?error=form');
        expect(requireActivePlayer).not.toHaveBeenCalled();
        expect(placeBet).not.toHaveBeenCalled();
    });

    it('stops at the player check when nobody is signed in', async () => {
        requireActivePlayer.mockRejectedValue(new Error('redirect:/login'));
        await expect(POST(post({ 'sec-fetch-site': 'same-origin' }))).rejects.toThrow('redirect:/login');
        expect(placeBet).not.toHaveBeenCalled();
    });

    it('places the bet for the signed in player and sends the refusal code back', async () => {
        requireActivePlayer.mockResolvedValue({ id: 5 });
        placeBet.mockResolvedValueOnce({ ok: true, raised: false }).mockResolvedValueOnce({ ok: false, error: 'closed' });
        const placed = await POST(post({ 'sec-fetch-site': 'same-origin' }));
        expect(placed.headers.get('location')).toBe('/me?bet=placed');
        expect(placeBet).toHaveBeenCalledWith({}, 5, { matchId: 1, onPlayerId: 2, amount: 10 }, expect.any(Date));
        const refused = await POST(post({ 'sec-fetch-site': 'same-origin' }));
        expect(refused.headers.get('location')).toBe('/me?error=closed');
    });
});
