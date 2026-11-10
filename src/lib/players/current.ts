import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';
import { getSessionAccount, type SessionAccount, type SessionPlayer } from '@/lib/store/players';
import { isWellFormedToken, SESSION_COOKIE } from './session';

/** Where a signed in account goes to join the active event with its code. */
export const JOIN_EVENT_PATH = '/bli-med';

/** The signed in account on this device, with its player in the active event, or null. */
export async function getCurrentAccount(): Promise<SessionAccount | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!isWellFormedToken(token)) return null;
    return getSessionAccount(getPool(), token, new Date());
}

/**
 * The signed in player of the active event. A signed out visitor is sent to sign-in, and an
 * account that has not joined the active event to the step that joins it. Pages and actions that
 * change a player's data use this.
 */
export async function requireActivePlayer(): Promise<SessionPlayer> {
    const account = await getCurrentAccount();
    if (!account) redirect('/login');
    if (!account.player) redirect(JOIN_EVENT_PATH);
    return account.player;
}

/**
 * The signed in player of the active event, or null. It never redirects, so API routes can answer
 * a signed out request themselves.
 */
export async function getActivePlayer(): Promise<SessionPlayer | null> {
    return (await getCurrentAccount())?.player ?? null;
}
