import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER = /^Bearer +(\S+)$/i;

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * Checks the token of a game server call. It answers 503 when GAME_SERVER_TOKEN is not set, and
 * 401 when the Authorization header is missing or holds another token. Returns null when the
 * call may go on. The SHA-256 digests have the same length, so the comparison takes the same
 * time whatever the token is. The token is never logged.
 */
export function refuseGameServer(req: Request, env: Record<string, string | undefined>): Response | null {
    const expected = env.GAME_SERVER_TOKEN;
    if (!expected) return Response.json({ error: 'not-configured' }, { status: 503 });
    const given = BEARER.exec(req.headers.get('authorization') ?? '')?.[1];
    if (given === undefined || !timingSafeEqual(digest(given), digest(expected))) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    }
    return null;
}
