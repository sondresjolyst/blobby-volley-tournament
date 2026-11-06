import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { getServerSync } from '@/lib/store/game-server';

/** The players and the called or started matches of the active event, for the game server. */
export async function GET(req: Request) {
    const refused = refuseGameServer(req, process.env);
    if (refused) return refused;
    return Response.json(await getServerSync(getPool(), new Date()), { headers: { 'Cache-Control': 'no-store' } });
}
