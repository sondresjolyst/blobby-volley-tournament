import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { formNumber, isNextGameDelay } from '@/lib/matches/settings';
import { setNextGameDelay } from '@/lib/store/tournaments';

/** Sets the pause between games of a series, from /admin/tournaments/[id]. The game server gets it in the next sync. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const seconds = formNumber((await readForm(req)).nextGameDelay ?? '', -1);
    if (!isNextGameDelay(seconds)) return seeOther(`/admin/tournaments/${id}?error=next-game-delay`);
    if (!(await setNextGameDelay(getPool(), id, seconds))) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/tournaments/${id}?saved=1`);
}
