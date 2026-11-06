import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, seeOther } from '@/lib/http';
import { readSponsorForm } from '@/lib/sponsors/form';
import { makeGameLogo } from '@/lib/sponsors/logo';
import { createSponsor } from '@/lib/store/sponsors';

/** Adds a sponsor with its logo, from the sponsor list on /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    const eventId = parseId((await ctx.params).id);
    if (eventId === null) return Response.json({ error: 'not found' }, { status: 404 });
    const back = (query: string) => seeOther(`/admin/events/${eventId}?${query}#sponsors`);
    const form = await readSponsorForm(req);
    if (!form.ok) return back(`error=${form.error}`);
    if (!form.logo) return back('error=logo-missing');
    let gameLogo: Uint8Array;
    try {
        gameLogo = await makeGameLogo(form.logo, form.input.gameBackground);
    } catch {
        return back('error=logo-image');
    }
    const result = await createSponsor(getPool(), eventId, form.input, form.logo, gameLogo);
    if (!result.ok) {
        if (result.error === 'not-found') return Response.json({ error: 'not found' }, { status: 404 });
        return back('error=sponsor-limit');
    }
    return back(`sponsor=${result.id}`);
}
