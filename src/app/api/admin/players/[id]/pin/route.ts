import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { hashPin, isValidPin } from '@/lib/players/pin';
import { resetPlayerPin } from '@/lib/store/players';

/** Gives a player the new PIN from the form. The player is unlocked and signed out everywhere. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const { pin, eventId } = await readForm(req);
    if (!isValidPin(pin)) {
        const eventPage = parseId(eventId ?? '');
        return seeOther(eventPage === null ? '/admin/events' : `/admin/events/${eventPage}?error=pin`);
    }
    const result = await resetPlayerPin(getPool(), id, await hashPin(pin));
    if (!result) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${result.eventId}?reset=${id}`);
}
