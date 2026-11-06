import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getLiveScore } from '@/lib/store/game-server';

/** The live score of a match for the big screen. Public. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const live = await getLiveScore(getPool(), id);
    if (!live) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json(live, { headers: { 'Cache-Control': 'no-store' } });
}
