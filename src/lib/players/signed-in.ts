import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { createSession } from '@/lib/store/players';
import { SESSION_COOKIE, sessionCookieOptions } from './session';

/** Starts a session for the player, sets the cookie and sends the browser to the player page. */
export async function signedIn(playerId: number) {
    const { token, expiresAt } = await createSession(getPool(), playerId, new Date());
    const res = seeOther('/me');
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(process.env, expiresAt));
    return res;
}
