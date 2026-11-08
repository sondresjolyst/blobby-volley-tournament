import { clientBucket } from '@/lib/client-ip';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { RateWindow } from '@/lib/rate-window';
import { cachedLiveStamp, liveCache, UnknownEvent } from '@/lib/store/live';

/** How many reads a client may make per minute that the shared cache cannot answer. */
export const LIVE_MISSES_PER_MINUTE = 120;

const misses = new RateWindow(LIVE_MISSES_PER_MINUTE, 60_000);

/**
 * The live stamp of an event, `?event=<id>`. Public, since it is only two numbers. The open tabs
 * share one read for a couple of seconds, so many tabs cost one small query. Only reads the cache
 * cannot answer count against the client's limit, so the open tabs of a LAN never reach it. 404 for
 * an event that does not exist, which is never cached.
 */
export async function GET(req: Request) {
    const raw = new URL(req.url).searchParams.get('event');
    const eventId = raw === null ? null : parseId(raw);
    if (eventId === null) return Response.json({ error: 'event' }, { status: 400 });
    if (!liveCache.has(String(eventId)) && !misses.take(clientBucket(req.headers, process.env))) {
        return Response.json({ error: 'busy' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
    try {
        const stamp = await cachedLiveStamp(getPool(), eventId);
        return Response.json({ stamp }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof UnknownEvent) return Response.json({ error: 'not-found' }, { status: 404 });
        throw error;
    }
}
