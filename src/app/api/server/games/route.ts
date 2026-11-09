import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { badRequest, isTrainingBody, parseGameReport, parseTrainingReport, readJsonBody } from '@/lib/game-server/input';
import { reportServerGame } from '@/lib/store/matches';
import { reportTrainingGame } from '@/lib/store/training';

/**
 * The game server reports one game. The answer says what happened: stored, duplicate,
 * game-closed, or refused with a reason. Each of these is final, so the report need not be sent again.
 */
export async function POST(req: Request) {
    const refused = await refuseGameServer(req);
    if (refused) return refused;
    const body = await readJsonBody(req);
    // A training game against the bot of the game server is kept apart from the real results.
    if (isTrainingBody(body)) {
        const training = parseTrainingReport(body);
        if (!training.ok) return badRequest(training.field);
        return Response.json(await reportTrainingGame(getPool(), training.value));
    }
    const input = parseGameReport(body);
    if (!input.ok) return badRequest(input.field);
    const report = input.value;
    const result = await reportServerGame(getPool(), {
        reportId: report.reportId,
        matchId: report.matchId,
        game: report.game,
        winnerId: report.status === 'finished' ? report.winnerId : null,
        leftPlayerId: report.leftPlayerId,
        points: report.points,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
    });
    if (!result.ok) return Response.json({ status: 'refused', reason: result.error });
    if (result.status === 'applied') return Response.json({ status: 'stored' });
    if (result.status === 'duplicate') return Response.json({ status: 'duplicate' });
    if (result.reason === 'game-closed') return Response.json({ status: 'game-closed' });
    return Response.json({ status: 'refused', reason: result.reason });
}
