import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { IMMUTABLE, logoResponse } from '@/lib/sponsors/serve';
import { getSponsorLogo } from '@/lib/store/sponsors';

/**
 * Public. The logo of an enabled sponsor of the active event, for the footer. With ?v= set to
 * the hash of the logo the address never changes its content, so it may be cached for a year.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const logo = await getSponsorLogo(getPool(), id);
    if (!logo || !logo.enabled || !logo.eventActive) return Response.json({ error: 'not found' }, { status: 404 });
    const version = new URL(req.url).searchParams.get('v');
    return logoResponse(req, logo, version === logo.hash ? IMMUTABLE : 'public, no-cache');
}
