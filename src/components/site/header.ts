import type { Pool } from 'pg';
import { getActivePlayer } from '@/lib/players/current';
import { getActiveEvent } from '@/lib/store/events';

/** What the site header shows: the name of the active event, and the signed in player of it. */
export async function siteHeader(pool: Pool): Promise<{ eventName: string | null; player: { nickname: string; balance: number } | null }> {
    const [event, player] = await Promise.all([getActiveEvent(pool), getActivePlayer()]);
    const shown = player && event && player.eventId === event.id ? { nickname: player.nickname, balance: player.fozaBalance } : null;
    return { eventName: event?.name ?? null, player: shown };
}
