import { parseBetForm } from '@/lib/betting/input';
import { getPool } from '@/lib/db';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { requireActivePlayer } from '@/lib/players/current';
import { listPlayerBets, placeBet } from '@/lib/store/bets';

/** The signed in player's bets with their results, the newest first. */
export async function GET() {
    const player = await requireActivePlayer();
    return Response.json({ bets: await listPlayerBets(getPool(), player.id) });
}

/** Places a bet from the form on /me, or raises the player's bet on the match. */
export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther('/me?error=form');
    const player = await requireActivePlayer();
    const input = parseBetForm(await readForm(req));
    if (!input) return seeOther('/me?error=form');
    const result = await placeBet(getPool(), player.id, input, new Date());
    if (!result.ok) return seeOther(`/me?error=${result.error}`);
    return seeOther(`/me?bet=${result.raised ? 'raised' : 'placed'}`);
}
