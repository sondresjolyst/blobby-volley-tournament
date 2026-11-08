import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { parseGameBoard } from '@/lib/sponsors/input';
import { setGameBoard } from '@/lib/store/events';

/** Sets the style of the sponsor board in the game, from the sponsor list on /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const board = parseGameBoard((await readForm(req)).gameBoard);
    if (board === null) return Response.json({ error: 'invalid' }, { status: 400 });
    if (!(await setGameBoard(getPool(), id, board))) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${id}?boardSaved=1#sponsors`);
}
