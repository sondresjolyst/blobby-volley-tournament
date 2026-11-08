import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { setActiveEvent } from '@/lib/store/events';

/** Makes this event the active one. Every other event becomes inactive. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null || !(await setActiveEvent(getPool(), id))) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther('/admin/events');
}
