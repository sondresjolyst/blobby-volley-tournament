import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('@/lib/db', () => ({ getPool: () => ({ query }) }));

import { GET, LIVE_MISSES_PER_MINUTE } from './route';

const read = async (query: string) => {
    const res = await GET(new Request(`https://bvt.example.test/api/live${query}`));
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

// Events 7 and 8 exist, 7 is the active one. Each test uses its own ids, so the shared cache of one
// test never answers another.
beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (_sql: string, [id]: [number]) => ({ rows: id < 100 ? [{ live_version: String(id * 10), active: 7 }] : [] }));
});

describe('GET /api/live', () => {
    it('answers the active event and the live version of the event in the address, never cached by the browser', async () => {
        expect(await read('?event=8')).toEqual({ status: 200, body: { stamp: '7:80' }, cache: 'no-store' });
    });

    it('lets many tabs share one read for a short while', async () => {
        await Promise.all([read('?event=9'), read('?event=9'), read('?event=9')]);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for an event that does not exist, and does not keep it', async () => {
        expect((await read('?event=123')).status).toBe(404);
        expect((await read('?event=123')).status).toBe(404);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('refuses an address without a good event id', async () => {
        for (const q of ['', '?event=', '?event=x', '?event=-1']) expect((await read(q)).status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });

    it('limits the reads a client makes past the cache, but not the reads the cache answers', async () => {
        await read('?event=9');
        let status = 200;
        for (let i = 0; i <= LIVE_MISSES_PER_MINUTE && status !== 429; i++) status = (await read(`?event=${1000 + i}`)).status;
        expect(status).toBe(429);
        // Event 9 is in the cache, so it is still answered.
        expect((await read('?event=9')).status).toBe(200);
    });
});
