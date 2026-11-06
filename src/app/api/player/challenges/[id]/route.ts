import { getPool } from '@/lib/db';
import { isTrustedPost, parseId, readForm, seeOther } from '@/lib/http';
import { parseChallengeAnswer } from '@/lib/matches/input';
import { getActivePlayer } from '@/lib/players/current';
import { acceptChallenge, declineChallenge, withdrawChallenge, type MatchResult } from '@/lib/store/matches';

const DONE = { accept: 'accepted', decline: 'declined', withdraw: 'withdrawn' } as const;

/**
 * Answers a 1v1 match from /me. The asked player accepts or declines it, and the asker can withdraw
 * it until it is accepted. The store checks that the signed in player may do this. Sends a signed
 * out browser to sign-in.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    if (!isTrustedPost(req, process.env)) return seeOther('/me?challengeError=form#utfordringa');
    const player = await getActivePlayer();
    if (!player) return seeOther('/login');
    const id = parseId((await ctx.params).id);
    const answer = parseChallengeAnswer(await readForm(req));
    if (id === null || answer === null) return seeOther('/me?challengeError=form#utfordringa');
    const pool = getPool();
    let result: MatchResult;
    if (answer === 'accept') result = await acceptChallenge(pool, id, player.id);
    else if (answer === 'decline') result = await declineChallenge(pool, id, player.id);
    else result = await withdrawChallenge(pool, id, player.id);
    if (!result.ok) return seeOther(`/me?challengeError=${result.error}#utfordringa`);
    return seeOther(`/me?challenge=${DONE[answer]}#utfordringa`);
}
