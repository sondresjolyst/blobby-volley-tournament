import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { addFromLibrary } from '@/lib/store/sponsors';

/** Puts a sponsor from the library on the sponsor list of an event, from /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const eventId = parseId((await ctx.params).id);
    if (eventId === null) return Response.json({ error: 'not found' }, { status: 404 });
    const back = (query: string) => seeOther(`/admin/events/${eventId}?${query}#sponsors`);
    const libraryId = parseId((await readForm(req)).libraryId ?? '');
    if (libraryId === null) return back('error=library-pick');
    const result = await addFromLibrary(getPool(), eventId, libraryId);
    if (!result.ok) {
        if (result.error === 'not-found') return Response.json({ error: 'not found' }, { status: 404 });
        return back(result.error === 'taken' ? 'error=sponsor-taken' : 'error=sponsor-limit');
    }
    return back(`sponsor=${result.id}`);
}
