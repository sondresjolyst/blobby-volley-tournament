import { getPool } from '@/lib/db';
import { isTrustedPost, parseId, readForm, seeOther } from '@/lib/http';
import { parseChallengeAnswer } from '@/lib/matches/input';
import { getActivePlayer } from '@/lib/players/current';
import { acceptChallenge, declineChallenge, withdrawChallenge, type MatchResult } from '@/lib/store/matches';


/**
 * Answers a 1v1 match from /me. The asked player accepts or declines it, and the asker can withdraw
 * it until it is accepted. An accepted match is called at once, or queued while a player is busy. The store checks that the signed in player may do this. Sends a signed
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
    let done: string;
    if (answer === 'accept') {
        const accepted = await acceptChallenge(pool, id, player.id);
        result = accepted;
        done = accepted.ok && !accepted.called ? 'queued' : 'accepted';
    } else if (answer === 'decline') {
        result = await declineChallenge(pool, id, player.id);
        done = 'declined';
    } else {
        result = await withdrawChallenge(pool, id, player.id);
        done = 'withdrawn';
    }
    if (!result.ok) return seeOther(`/me?challengeError=${result.error}#utfordringa`);
    return seeOther(`/me?challenge=${done}#utfordringa`);
}
