import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getMatchPool } from '@/lib/store/bets';

/** The pool size of a match and the current payout multiplier for each player. Public. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const pool = await getMatchPool(getPool(), id);
    if (!pool) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json(pool);
}
