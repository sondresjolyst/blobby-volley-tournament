import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '@/lib/ttl-cache';

const liveStamp = vi.fn();
let now = 0;

vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/store/live', () => ({ liveStamp: (...args: unknown[]) => liveStamp(...args), liveCache: new TtlCache<string>(2_000, () => now) }));

import { GET } from './route';

const read = async (query: string) => {
    const res = await GET(new Request(`https://bvt.example.test/api/live${query}`));
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

beforeEach(() => {
    liveStamp.mockReset();
    liveStamp.mockResolvedValue('abc:1:2');
    now += 10_000;
});

describe('GET /api/live', () => {
    it('answers the stamp of the event in the address, never cached by the browser', async () => {
        expect(await read('?event=7')).toEqual({ status: 200, body: { stamp: 'abc:1:2' }, cache: 'no-store' });
        expect(liveStamp).toHaveBeenCalledWith({}, 7);
    });

    it('lets many tabs share one read for a short while, per event', async () => {
        await Promise.all([read('?event=7'), read('?event=7'), read('?event=7')]);
        expect(liveStamp).toHaveBeenCalledTimes(1);
        await read('?event=8');
        expect(liveStamp).toHaveBeenCalledTimes(2);
        now += 2_000;
        await read('?event=7');
        expect(liveStamp).toHaveBeenCalledTimes(3);
    });

    it('refuses an address without a good event id', async () => {
        for (const query of ['', '?event=', '?event=x', '?event=-1']) expect((await read(query)).status).toBe(400);
        expect(liveStamp).not.toHaveBeenCalled();
    });
});
