import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { createSession } from '@/lib/store/players';
import { SESSION_COOKIE, sessionCookieOptions } from './session';

/**
 * Starts a session for the account, sets the cookie and sends the browser to the player page. The
 * player page sends an account that has not joined the active event on to join it.
 */
export async function signedIn(accountId: number) {
    const { token, expiresAt } = await createSession(getPool(), accountId, new Date());
    const res = await seeOther('/me');
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(process.env, expiresAt));
    return res;
}
