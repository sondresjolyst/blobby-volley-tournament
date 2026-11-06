import { redirect } from 'next/navigation';
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

/**
 * The signed in player, whose event must still be active. Anyone else is sent to sign-in. Pages
 * and actions that change a player's data use this.
 */
export async function requireActivePlayer(): Promise<SessionPlayer> {
    const player = await getActivePlayer();
    if (!player) redirect('/login');
    return player;
}

/**
 * The signed in player whose event is still active, or null. It never redirects, so API routes
 * can answer a signed out request themselves.
 */
export async function getActivePlayer(): Promise<SessionPlayer | null> {
    const player = await getCurrentPlayer();
    return player && player.eventActive ? player : null;
}
