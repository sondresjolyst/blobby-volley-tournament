import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBigScreen = vi.fn();

vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/big-screen', () => ({ getBigScreen: (...args: unknown[]) => getBigScreen(...args) }));

import { GET } from './route';

beforeEach(() => {
    getBigScreen.mockReset();
    getBigScreen.mockResolvedValue({ eventCode: null });
});

describe('GET /api/big', () => {
    it('hands the key from the address to the store, which checks it against the active event', async () => {
        const res = await GET(new Request('https://bvt.example.test/api/big?t=4&key=Ab_9-x'));
        expect(getBigScreen).toHaveBeenCalledWith({}, 4, 'Ab_9-x');
        expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('passes no key when there is none', async () => {
        await GET(new Request('https://bvt.example.test/api/big'));
        expect(getBigScreen).toHaveBeenCalledWith({}, null, null);
    });
});
