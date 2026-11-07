import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { rotateBigScreenKey } from '@/lib/store/events';

/**
 * Gives the event a new big screen key, from /admin/events/[id]. The form must have the confirm box
 * checked. The old address stops showing the join card.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    if ((await readForm(req)).confirm !== 'yes') return seeOther(`/admin/events/${id}?error=bigScreenConfirm#big-screen`);
    if (!(await rotateBigScreenKey(getPool(), id))) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${id}?bigScreenKey=new#big-screen`);
}
