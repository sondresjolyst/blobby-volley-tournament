import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { badRequest, parseConnected, parseTrainingConnected, readJsonBody } from '@/lib/game-server/input';
import { parseId } from '@/lib/http';
import { reportPlayersConnected } from '@/lib/store/matches';
import { isTrainingMatch, reportTrainingConnected } from '@/lib/store/training';

/** The game server reports both players of a match connected. A called match starts. Repeat calls change nothing. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const refused = await refuseGameServer(req);
    if (refused) return refused;
    const id = parseId((await ctx.params).id);
    if (id === null) return badRequest('id');
    const body = await readJsonBody(req);
    // The player of a training match plays the bot of the game server, which has id 0.
    if (await isTrainingMatch(getPool(), id)) {
        const training = parseTrainingConnected(body);
        if (!training.ok) return badRequest(training.field);
        const started = await reportTrainingConnected(getPool(), id, training.value.playerIds);
        if (!started.ok) return Response.json({ status: 'refused', reason: started.error });
        return Response.json({ status: started.started ? 'started' : 'already-started' });
    }
    const input = parseConnected(body);
    if (!input.ok) return badRequest(input.field);
    const result = await reportPlayersConnected(getPool(), id, input.value.playerIds);
    if (!result.ok) return Response.json({ status: 'refused', reason: result.error });
    return Response.json({ status: result.started ? 'started' : 'already-started' });
}
