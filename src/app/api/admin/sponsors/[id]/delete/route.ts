import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { deleteSponsor } from '@/lib/store/sponsors';

/** Deletes a sponsor and its logos, from the sponsor list on /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const eventId = await deleteSponsor(getPool(), id);
    if (eventId === null) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${eventId}?sponsorDeleted=1#sponsors`);
}
