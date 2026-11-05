import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { getSessionPlayer, type SessionPlayer } from '@/lib/store/players';
import { isWellFormedToken, SESSION_COOKIE } from './session';

/** The signed in player on this device, or null. */
export async function getCurrentPlayer(): Promise<SessionPlayer | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!isWellFormedToken(token)) return null;
    return getSessionPlayer(getPool(), token, new Date());
}
