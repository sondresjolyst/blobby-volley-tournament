import { getActivePlayer } from '@/lib/players/current';

/** What the site header shows: the name of the active event, and the signed in player of it. The caller reads the active event. */
export async function siteHeader(active: { id: number; name: string } | null): Promise<{ eventName: string | null; player: { nickname: string; balance: number } | null }> {
    const player = active ? await getActivePlayer() : null;
    const shown = player && player.eventId === active?.id ? { nickname: player.nickname, balance: player.fozaBalance } : null;
    return { eventName: active?.name ?? null, player: shown };
}
