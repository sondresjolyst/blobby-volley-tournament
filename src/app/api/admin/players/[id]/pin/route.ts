import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { keptListQuery, withListQuery } from '@/lib/paging';
import { hashPin, isValidPin } from '@/lib/players/pin';
import { resetPlayerPin } from '@/lib/store/players';

/** Gives a player the new PIN from the form. The player is unlocked and signed out everywhere. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const form = await readForm(req);
    // The page and the search of the player list, so the admin comes back to the same page.
    const kept = keptListQuery(form, ['players']);
    if (!isValidPin(form.pin)) {
        const eventPage = parseId(form.eventId ?? '');
        return seeOther(eventPage === null ? '/admin/events' : withListQuery(`/admin/events/${eventPage}`, kept, 'error=pin'));
    }
    const result = await resetPlayerPin(getPool(), id, await hashPin(form.pin));
    if (!result) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(withListQuery(`/admin/events/${result.eventId}`, kept, `reset=${id}`));
}
