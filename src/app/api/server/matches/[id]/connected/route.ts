import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { badRequest, parseConnected, readJsonBody } from '@/lib/game-server/input';
import { parseId } from '@/lib/http';
import { reportPlayersConnected } from '@/lib/store/matches';

/** The game server reports both players of a match connected. A called match starts. Repeat calls change nothing. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const refused = refuseGameServer(req, process.env);
    if (refused) return refused;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not-found' }, { status: 404 });
    const input = parseConnected(await readJsonBody(req));
    if (!input.ok) return badRequest(input.field);
    const result = await reportPlayersConnected(getPool(), id, input.value.playerIds);
    if (!result.ok) {
        if (result.error === 'not-found') return Response.json({ error: 'not-found' }, { status: 404 });
        return Response.json({ status: 'refused', reason: result.error });
    }
    return Response.json({ status: result.started ? 'started' : 'already-started' });
}
