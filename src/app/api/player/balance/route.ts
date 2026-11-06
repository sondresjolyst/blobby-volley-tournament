import { getPool } from '@/lib/db';
import { requireActivePlayer } from '@/lib/players/current';
import { getBalance } from '@/lib/store/foza';

/** The signed in player's Foza, after the daily Foza for today is paid. */
export async function GET() {
    const player = await requireActivePlayer();
    const balance = await getBalance(getPool(), player.id, new Date());
    return Response.json({ balance });
}
