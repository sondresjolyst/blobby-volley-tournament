import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { parseDirection } from '@/lib/sponsors/input';
import { moveSponsor } from '@/lib/store/sponsors';

/** Moves a sponsor one place up or down, from the sponsor list on /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const direction = parseDirection((await readForm(req)).direction);
    if (direction === null) return Response.json({ error: 'invalid' }, { status: 400 });
    const eventId = await moveSponsor(getPool(), id, direction);
    if (eventId === null) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${eventId}#sponsors`);
}
