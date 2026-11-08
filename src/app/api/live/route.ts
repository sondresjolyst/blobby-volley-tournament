import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { liveCache, liveStamp } from '@/lib/store/live';

/**
 * The live stamp of an event, `?event=<id>`. Public, since it is only a hash and two counters. The
 * open tabs share one read for a couple of seconds, so many tabs cost one small query.
 */
export async function GET(req: Request) {
    const raw = new URL(req.url).searchParams.get('event');
    const eventId = raw === null ? null : parseId(raw);
    if (eventId === null) return Response.json({ error: 'event' }, { status: 400 });
    const stamp = await liveCache.get(String(eventId), () => liveStamp(getPool(), eventId));
    return Response.json({ stamp }, { headers: { 'Cache-Control': 'no-store' } });
}
