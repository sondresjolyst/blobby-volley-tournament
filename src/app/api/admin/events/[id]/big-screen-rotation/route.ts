import { requireAdminPost } from '@/lib/auth/options';
import { parseRotationInput } from '@/lib/big-screen/screens';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { setBigScreenRotation } from '@/lib/store/events';

/** Sets the screens the big screen takes turns on and how long each stays up, from /admin/events/[id]. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const input = parseRotationInput(await readForm(req));
    if (!input.ok) return seeOther(`/admin/events/${id}?error=${input.error}#big-screen-rotation`);
    if (!(await setBigScreenRotation(getPool(), id, input.value))) return Response.json({ error: 'not found' }, { status: 404 });
    return seeOther(`/admin/events/${id}?rotationSaved=1#big-screen-rotation`);
}
