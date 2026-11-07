import { requireAdminRead } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { getGameServerReportAge } from '@/lib/store/game-server-token';

/** Seconds since the last recorded call of the game server, for the live line on /admin/game-server. Null when it never called. */
export async function GET(req: Request) {
    const admin = await requireAdminRead(req);
    if (admin instanceof Response) return admin;
    return Response.json({ ageSeconds: await getGameServerReportAge(getPool()) }, { headers: { 'Cache-Control': 'no-store' } });
}
