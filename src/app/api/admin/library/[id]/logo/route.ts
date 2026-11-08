import { requireAdminRead } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { logoResponse } from '@/lib/sponsors/serve';
import { getLibraryLogo } from '@/lib/store/sponsors';

/** The uploaded logo of a library sponsor, shown on /admin/sponsors. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminRead(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const logo = await getLibraryLogo(getPool(), id);
    if (!logo) return Response.json({ error: 'not found' }, { status: 404 });
    return logoResponse(req, logo, 'private, no-cache');
}
