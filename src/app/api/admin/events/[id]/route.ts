import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseEventInput } from '@/lib/events/input';
import { parseId, readForm, seeOther } from '@/lib/http';
import { updateEvent } from '@/lib/store/events';

/** Saves the edit form on /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const input = parseEventInput(await readForm(req));
    if (!input.ok) return seeOther(`/admin/events/${id}?error=${input.error}`);
    if (!(await updateEvent(getPool(), id, input.value))) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${id}?saved=1`);
}
