import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { badRequest, parseLive, readJsonBody } from '@/lib/game-server/input';
import { updateLiveScore } from '@/lib/store/game-server';

/** The game server sends the score of the game being played. Best effort: it never changes a result. */
export async function POST(req: Request) {
    const refused = refuseGameServer(req, process.env);
    if (refused) return refused;
    const input = parseLive(await readJsonBody(req));
    if (!input.ok) return badRequest(input.field);
    return Response.json(await updateLiveScore(getPool(), input.value, new Date()));
}
