import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseEventInput } from '@/lib/events/input';
import { readForm, seeOther } from '@/lib/http';
import { createEvent } from '@/lib/store/events';

/** Creates an event from the form on /admin/events/new. */
export async function POST(req: Request) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const input = parseEventInput(await readForm(req));
    if (!input.ok) return seeOther(`/admin/events/new?error=${input.error}`);
    const id = await createEvent(getPool(), input.value);
    return seeOther(`/admin/events/${id}?saved=1`);
}
