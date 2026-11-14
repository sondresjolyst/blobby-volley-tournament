import { getPool } from '@/lib/db';
import { getActivePlayer } from '@/lib/players/current';
import { getBalance } from '@/lib/store/foza';

/** The signed in player's Foza, after the daily Foza for today is paid. 401 when signed out. */
export async function GET() {
    const player = await getActivePlayer();
    if (!player) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const balance = await getBalance(getPool(), player.id, new Date());
    return Response.json({ balance }, { headers: { 'Cache-Control': 'no-store' } });
}
