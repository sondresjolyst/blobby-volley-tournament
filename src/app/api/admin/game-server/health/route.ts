import { requireAdminRead } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { reportAge } from '@/lib/game-server/health';
import { getGameServerTokenInfo } from '@/lib/store/game-server-token';

/** Seconds since the game server last called the site, for the live line on /admin/game-server. Null when it never did. */
export async function GET(req: Request) {
    const admin = await requireAdminRead(req);
    if (admin instanceof Response) return admin;
    const info = await getGameServerTokenInfo(getPool());
    return Response.json({ ageSeconds: reportAge(info?.lastUsedAt ?? null, new Date()) }, { headers: { 'Cache-Control': 'no-store' } });
}
