import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { unlockPlayer } from '@/lib/store/players';

/** Forgets the wrong PINs of a player and lifts the lock, from the player list. The PIN stays the same. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const result = await unlockPlayer(getPool(), id);
    if (!result) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${result.eventId}?unlocked=${id}`);
}
