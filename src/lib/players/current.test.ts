import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionPlayer } from '@/lib/store/players';

const cookieValue = vi.fn<() => string | undefined>();
const getSessionPlayer = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (cookieValue() === undefined ? undefined : { value: cookieValue() }) }) }));
vi.mock('next/navigation', () => ({
    redirect: (to: string) => {
        throw new Error('redirect:' + to);
    },
}));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/players', () => ({ getSessionPlayer: (...args: unknown[]) => getSessionPlayer(...args) }));

import { getActivePlayer, requireActivePlayer } from './current';

const token = 'a'.repeat(43);
const player: SessionPlayer = { id: 1, nickname: 'Ola', fozaBalance: 1000, eventId: 2, eventName: 'LAN', eventActive: true };

afterEach(() => {
    cookieValue.mockReset();
    getSessionPlayer.mockReset();
});

describe('requireActivePlayer', () => {
    it('returns the player when the event is active', async () => {
        cookieValue.mockReturnValue(token);
        getSessionPlayer.mockResolvedValue(player);
        await expect(requireActivePlayer()).resolves.toBe(player);
    });

    it('sends a player whose event is no longer active to sign-in', async () => {
        cookieValue.mockReturnValue(token);
        getSessionPlayer.mockResolvedValue({ ...player, eventActive: false });
        await expect(requireActivePlayer()).rejects.toThrow('redirect:/login');
    });

    it('sends a visitor without a session to sign-in', async () => {
        cookieValue.mockReturnValue(undefined);
        await expect(requireActivePlayer()).rejects.toThrow('redirect:/login');
        expect(getSessionPlayer).not.toHaveBeenCalled();
    });

    it('sends a visitor with an unknown token to sign-in', async () => {
        cookieValue.mockReturnValue(token);
        getSessionPlayer.mockResolvedValue(null);
        await expect(requireActivePlayer()).rejects.toThrow('redirect:/login');
    });
});

describe('getActivePlayer', () => {
    it('returns the player when the event is active and null otherwise, without redirecting', async () => {
        cookieValue.mockReturnValue(token);
        getSessionPlayer.mockResolvedValue(player);
        await expect(getActivePlayer()).resolves.toBe(player);
        getSessionPlayer.mockResolvedValue({ ...player, eventActive: false });
        await expect(getActivePlayer()).resolves.toBeNull();
        cookieValue.mockReturnValue(undefined);
        await expect(getActivePlayer()).resolves.toBeNull();
    });
});
