import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { resetPinLimits } from '@/lib/store/players';

/** Lets every client address try PINs again after it went over its hourly limit. Sends the admin back to the event page. */
export async function POST(req: Request) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const eventId = parseId((await readForm(req)).eventId ?? '');
    await resetPinLimits(getPool());
    return seeOther(eventId === null ? '/admin/events' : `/admin/events/${eventId}?pinLimit=reset`);
}
