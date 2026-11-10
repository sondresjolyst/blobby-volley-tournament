import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionAccount, SessionPlayer } from '@/lib/store/players';

const cookieValue = vi.fn<() => string | undefined>();
const getSessionAccount = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (cookieValue() === undefined ? undefined : { value: cookieValue() }) }) }));
vi.mock('next/navigation', () => ({
    redirect: (to: string) => {
        throw new Error('redirect:' + to);
    },
}));
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/players', () => ({ getSessionAccount: (...args: unknown[]) => getSessionAccount(...args) }));

import { getActivePlayer, requireActivePlayer } from './current';

const token = 'a'.repeat(43);
const player: SessionPlayer = { id: 1, nickname: 'Ola', fozaBalance: 1000, eventId: 2, eventName: 'LAN' };
const account: SessionAccount = { accountId: 7, nickname: 'Ola', player };
// Signed in, but not in the active event, or no event is active.
const notJoined: SessionAccount = { ...account, player: null };

afterEach(() => {
    cookieValue.mockReset();
    getSessionAccount.mockReset();
});

describe('requireActivePlayer', () => {
    it('returns the player of the account in the active event', async () => {
        cookieValue.mockReturnValue(token);
        getSessionAccount.mockResolvedValue(account);
        await expect(requireActivePlayer()).resolves.toBe(player);
    });

    it('sends an account that has not joined the active event to join it', async () => {
        cookieValue.mockReturnValue(token);
        getSessionAccount.mockResolvedValue(notJoined);
        await expect(requireActivePlayer()).rejects.toThrow('redirect:/bli-med');
    });

    it('sends a visitor without a session to sign-in', async () => {
        cookieValue.mockReturnValue(undefined);
        await expect(requireActivePlayer()).rejects.toThrow('redirect:/login');
        expect(getSessionAccount).not.toHaveBeenCalled();
    });

    it('sends a visitor with an unknown token to sign-in', async () => {
        cookieValue.mockReturnValue(token);
        getSessionAccount.mockResolvedValue(null);
        await expect(requireActivePlayer()).rejects.toThrow('redirect:/login');
    });
});

describe('getActivePlayer', () => {
    it('returns the player of the active event and null otherwise, without redirecting', async () => {
        cookieValue.mockReturnValue(token);
        getSessionAccount.mockResolvedValue(account);
        await expect(getActivePlayer()).resolves.toBe(player);
        getSessionAccount.mockResolvedValue(notJoined);
        await expect(getActivePlayer()).resolves.toBeNull();
        cookieValue.mockReturnValue(undefined);
        await expect(getActivePlayer()).resolves.toBeNull();
    });
});
