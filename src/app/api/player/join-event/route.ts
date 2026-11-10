import { getPool } from '@/lib/db';
import { clientBucket } from '@/lib/client-ip';
import { normalizeEventCode } from '@/lib/events/input';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { getCurrentAccount, JOIN_EVENT_PATH } from '@/lib/players/current';
import { joinEvent } from '@/lib/store/players';

/** Adds the signed in account to the active event with the event code from the form. Sends a signed out browser to sign-in. */
export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther(`${JOIN_EVENT_PATH}?error=form`);
    const account = await getCurrentAccount();
    if (!account) return seeOther('/login');
    const form = await readForm(req);
    const result = await joinEvent(getPool(), account.accountId, normalizeEventCode(form.code), clientBucket(req.headers, process.env), new Date());
    if (!result.ok) return seeOther(`${JOIN_EVENT_PATH}?error=${result.error}`);
    return seeOther('/me');
}
