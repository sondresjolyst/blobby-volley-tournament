import { getPool } from '@/lib/db';
import { getActivePlayer } from '@/lib/players/current';
import { playerMatchesStamp } from '@/lib/store/matches';

/** A short text that changes when a match of the signed in player changes. /me reads it to know when to load again. 401 when signed out. */
export async function GET() {
    const player = await getActivePlayer();
    if (!player) return Response.json({ error: 'unauthorized' }, { status: 401 });
    return Response.json({ stamp: await playerMatchesStamp(getPool(), player.id) });
}
