import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { rotateJoinCode } from '@/lib/store/players';

/** Gives a player a new join code from the player list. The old code stops working. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const result = await rotateJoinCode(getPool(), id);
    if (!result) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${result.eventId}?rotated=${id}`);
}
