import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { keptListQuery, withListQuery } from '@/lib/paging';
import { rotateJoinCode } from '@/lib/store/players';

/** Gives a player a new join code from the player list. The old code stops working. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    // The page and the search of the player list, so the admin comes back to the same page.
    const kept = keptListQuery(await readForm(req), ['players']);
    const result = await rotateJoinCode(getPool(), id);
    if (!result) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(withListQuery(`/admin/events/${result.eventId}`, kept, `rotated=${id}`));
}
