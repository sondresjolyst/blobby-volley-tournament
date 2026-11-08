import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId, readForm, seeOther } from '@/lib/http';
import { parseMatchForm } from '@/lib/matches/input';
import { callMatch, cancelMatch, enterGameResult, recordNoShow, resetMatch, restartCurrentGame, setSeriesScore, type MatchResult } from '@/lib/store/matches';

/** Runs one admin tool from /admin/matches/[id]: call, restart, game result, series score, no-show, cancel or reset. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    const id = parseId((await ctx.params).id);
    if (id === null) return Response.json({ error: 'not found' }, { status: 404 });
    const form = parseMatchForm(await readForm(req));
    if (!form) return seeOther(`/admin/matches/${id}?error=form`);
    const pool = getPool();
    let result: MatchResult;
    switch (form.action) {
        case 'call':
            result = await callMatch(pool, id);
            break;
        case 'restart':
            result = await restartCurrentGame(pool, id);
            break;
        case 'game':
            result = await enterGameResult(pool, id, form);
            break;
        case 'score':
            result = await setSeriesScore(pool, id, form.score1, form.score2);
            break;
        case 'no-show':
            result = await recordNoShow(pool, id, form.absentSlot);
            break;
        case 'cancel':
            result = await cancelMatch(pool, id);
            break;
        case 'reset':
            result = await resetMatch(pool, id);
            break;
    }
    if (!result.ok) {
        if (result.error === 'not-found') return Response.json({ error: 'not found' }, { status: 404 });
        const blocked = result.blockedBy === undefined ? '' : `&blocked=${result.blockedBy}`;
        return seeOther(`/admin/matches/${id}?error=${result.error}${blocked}`);
    }
    return seeOther(`/admin/matches/${id}?done=${form.action}`);
}
