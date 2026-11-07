import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { clearActiveEvent } from '@/lib/store/events';

/** Leaves no event active, which closes sign-up and sign-in. */
export async function POST(req: Request) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    await clearActiveEvent(getPool());
    return seeOther('/admin/events');
}
