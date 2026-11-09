import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { keptListQuery, withListQuery } from '@/lib/paging';
import { unlockPlayer } from '@/lib/store/players';

/** Forgets the wrong PINs of a player and lifts the lock, from the player list. The PIN stays the same. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    // The page and the search of the player list, so the admin comes back to the same page.
    const kept = keptListQuery(await readForm(req), ['players']);
    const result = await unlockPlayer(getPool(), id);
    if (!result) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(withListQuery(`/admin/events/${result.eventId}`, kept, `unlocked=${id}`));
}
