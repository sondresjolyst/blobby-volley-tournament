import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { deleteLibrarySponsor } from '@/lib/store/sponsors';

/** Deletes a sponsor from the library, from /admin/sponsors. A sponsor an event uses is kept. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const result = await deleteLibrarySponsor(getPool(), id);
    if (result === 'not-found') return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(result === 'deleted' ? '/admin/sponsors?deleted=1' : '/admin/sponsors?error=library-in-use');
}
