import { getPool } from '@/lib/db';
import { refuseGameServer } from '@/lib/game-server/auth';
import { badRequest, parseGameReport, readJsonBody } from '@/lib/game-server/input';
import { reportServerGame } from '@/lib/store/matches';

/**
 * The game server reports one game. The answer says what happened: stored, duplicate,
 * game-closed, or refused with a reason. Each of these is final, so the report need not be sent again.
 */
export async function POST(req: Request) {
    const refused = await refuseGameServer(req);
    if (refused) return refused;
    const input = parseGameReport(await readJsonBody(req));
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
