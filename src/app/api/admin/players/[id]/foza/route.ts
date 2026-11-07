import { requireAdminPost } from '@/lib/auth/options';
import { parseAdjustmentForm } from '@/lib/betting/input';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { adjustBalance } from '@/lib/store/foza';

/** Adds or takes Foza from a player with a reason, from the player list on /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const form = await readForm(req);
    const eventPage = parseId(form.eventId ?? '');
    const back = (query: string) => seeOther(eventPage === null ? '/admin/events' : `/admin/events/${eventPage}?${query}`);
    const input = parseAdjustmentForm(form);
    if (!input) return back('error=foza-form');
    const result = await adjustBalance(getPool(), id, input.amount, input.reason, admin.githubId ?? null);
    if (!result.ok) {
        if (result.error === 'not-found') return Response.json({ error: 'not found' }, { status: 404 });
        return back(result.error === 'balance' ? 'error=foza-balance' : 'error=foza-form');
    }
    return seeOther(`/admin/events/${result.eventId}?adjusted=${id}`);
}
