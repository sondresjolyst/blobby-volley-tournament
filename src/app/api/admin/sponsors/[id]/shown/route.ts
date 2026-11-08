import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { setSponsorShown } from '@/lib/store/sponsors';

/** Turns a sponsor on or off at its event, from the Shown switch on /admin/events/[id]. Nothing else changes. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const shown = (await readForm(req)).enabled;
    if (shown !== 'on' && shown !== 'off') return Response.json({ error: 'invalid' }, { status: 400 });
    const eventId = await setSponsorShown(getPool(), id, shown === 'on');
    if (eventId === null) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${eventId}?sponsor=${id}#sponsors`);
}
