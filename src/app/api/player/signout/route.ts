import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { isTrustedPost, seeOther } from '@/lib/http';
import { isWellFormedToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/players/session';
import { deleteSession } from '@/lib/store/players';

export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther('/me');
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (isWellFormedToken(token)) await deleteSession(getPool(), token);
    const res = await seeOther('/');
    res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(process.env, new Date(0)));
    return res;
}
