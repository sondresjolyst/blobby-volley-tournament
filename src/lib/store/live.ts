// The live stamp of an event. The player pages read it often and load again only when it changes.
import type { Pool } from 'pg';
import { TtlCache } from '@/lib/ttl-cache';

/** How long the open tabs share one stamp read. */
export const LIVE_CACHE_MS = 2_000;

/** Holds stamps of existing events only, since a load for an unknown event fails and is not kept. */
export const liveCache = new TtlCache<string>(LIVE_CACHE_MS);

/** Thrown by a load of the stamp of an event that does not exist. */
export class UnknownEvent extends Error {}

/**
 * A short text that changes when anything the player pages show changes, or when another event
 * goes active. It is the active event and the live version of the event, which every change to its
 * matches, games, players, tournaments, Foza ledger or the event row moves in its own transaction
 * (see migration 0018). One primary key read. Null when the event does not exist.
 */
export async function liveStamp(pool: Pool, eventId: number): Promise<string | null> {
    const { rows } = await pool.query<{ live_version: string; active: number | null }>(
        'SELECT e.live_version, (SELECT id FROM events WHERE is_active) AS active FROM events e WHERE e.id = $1',
        [eventId],
    );
    return rows[0] ? `${rows[0].active ?? 0}:${rows[0].live_version}` : null;
}

/** The stamp through the shared cache. Throws UnknownEvent for an event that does not exist. */
export function cachedLiveStamp(pool: Pool, eventId: number): Promise<string> {
    return liveCache.get(String(eventId), async () => {
        const stamp = await liveStamp(pool, eventId);
        if (stamp === null) throw new UnknownEvent();
        return stamp;
    });
}
