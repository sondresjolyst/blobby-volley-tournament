import { timingSafeEqual } from 'node:crypto';
import { getPool } from '@/lib/db';
import { getStoredGameServerToken, hashGameServerToken, markGameServerTokenUsed } from '@/lib/store/game-server-token';

const BEARER = /^Bearer +(\S+)$/i;

/**
 * Checks the token of a game server call against the stored hash. It answers 503 when no token
 * has been made, and 401 when the Authorization header is missing or holds another token. Returns
 * null when the call may go on. The SHA-256 digests have the same length, so the comparison takes
 * the same time whatever the token is. The token is never logged.
 */
export function checkGameServerToken(req: Request, storedHash: Uint8Array | null): Response | null {
    if (!storedHash || storedHash.length !== 32) return Response.json({ error: 'not-configured' }, { status: 503 });
    const given = BEARER.exec(req.headers.get('authorization') ?? '')?.[1];
    if (given === undefined || !timingSafeEqual(hashGameServerToken(given), storedHash)) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    }
    return null;
}

/**
 * Checks a game server call with the stored token, and notes the use when it passes. The store only
 * writes when the last use is old enough by the database clock. Returns null when the call may go on.
 */
export async function refuseGameServer(req: Request): Promise<Response | null> {
    const pool = getPool();
    const stored = await getStoredGameServerToken(pool);
    const refused = checkGameServerToken(req, stored?.hash ?? null);
    if (!refused && stored) await markGameServerTokenUsed(pool, stored.hash);
    return refused;
}
