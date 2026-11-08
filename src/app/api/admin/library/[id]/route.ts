import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { readSponsorForm } from '@/lib/sponsors/form';
import { makeGameLogo } from '@/lib/sponsors/logo';
import { getLibraryLogo, updateLibrarySponsor } from '@/lib/store/sponsors';

/** Saves a sponsor in the library, for every event that uses it. Without a new file the logo stays. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const pool = getPool();
    const current = await getLibraryLogo(pool, id);
    if (!current) return Response.json({ error: 'not found' }, { status: 404 });
    const back = (query: string) => seeOther(`/admin/sponsors?${query}`);
    const form = await readSponsorForm(req);
    if (!form.ok) return back(`error=${form.error}`);
    // The game logo is made again from the stored logo too, since the background colour may have changed.
    let gameLogo: Uint8Array;
    try {
        gameLogo = await makeGameLogo(form.logo ?? current, form.input.gameBackground);
    } catch {
        return back('error=logo-image');
    }
    if (!(await updateLibrarySponsor(pool, id, form.input, form.logo, gameLogo))) return Response.json({ error: 'not found' }, { status: 404 });
    return back(`saved=${id}`);
}
