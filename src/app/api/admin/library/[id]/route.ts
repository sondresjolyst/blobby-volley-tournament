import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { readSponsorForm } from '@/lib/sponsors/form';
import { makeGameLogo } from '@/lib/sponsors/logo';
import { updateLibrarySponsor } from '@/lib/store/sponsors';

/** Saves a sponsor in the library, for every event that uses it. Without a new file the logo stays. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const back = (query: string) => seeOther(`/admin/sponsors?${query}`);
    const form = await readSponsorForm(req);
    if (!form.ok) return back(`error=${form.error}`);
    // The store makes the game logo from the row it has locked, so two saves at once never mix logos.
    const saved = await updateLibrarySponsor(getPool(), id, form.input, form.logo, makeGameLogo);
    if (saved === 'not-found') return Response.json({ error: 'not found' }, { status: 404 });
    if (saved === 'logo-image') return back('error=logo-image');
    return back(`saved=${id}`);
}
