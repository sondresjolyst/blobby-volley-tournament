import { parseBetForm } from '@/lib/betting/input';
import { getPool } from '@/lib/db';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { getActivePlayer } from '@/lib/players/current';
import { listPlayerBets, placeBet } from '@/lib/store/bets';

/** The signed in player's bets with their results, the newest first. 401 when signed out. */
export async function GET() {
    const player = await getActivePlayer();
    if (!player) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ bets: await listPlayerBets(getPool(), player.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Places a bet from the form on /me, or raises the player's bet on the match. Sends a signed out browser to sign-in. */
export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther('/me?error=form');
    const player = await getActivePlayer();
    if (!player) return seeOther('/login');
    const input = parseBetForm(await readForm(req));
    if (!input) return seeOther('/me?error=form');
    const result = await placeBet(getPool(), player.id, input, new Date());
    if (!result.ok) return seeOther(`/me?error=${result.error}`);
    return seeOther(`/me?bet=${result.raised ? 'raised' : 'placed'}`);
}
