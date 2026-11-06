import { getPool } from '@/lib/db';
import { isTrustedPost, parseId, readForm, seeOther } from '@/lib/http';
import { parseChallengeAnswer } from '@/lib/matches/input';
import { getActivePlayer } from '@/lib/players/current';
import { acceptChallenge, declineChallenge } from '@/lib/store/matches';

/**
 * The asked player accepts or declines a 1v1 match from /me. The store checks that the signed in
 * player is the one asked. Sends a signed out browser to sign-in.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    if (!isTrustedPost(req, process.env)) return seeOther('/me?challengeError=form#utfordringa');
    const player = await getActivePlayer();
    if (!player) return seeOther('/login');
    const id = parseId((await ctx.params).id);
    const answer = parseChallengeAnswer(await readForm(req));
    if (id === null || answer === null) return seeOther('/me?challengeError=form#utfordringa');
    const pool = getPool();
    const result = answer === 'accept' ? await acceptChallenge(pool, id, player.id) : await declineChallenge(pool, id, player.id);
    if (!result.ok) return seeOther(`/me?challengeError=${result.error}#utfordringa`);
    return seeOther(`/me?challenge=${answer === 'accept' ? 'accepted' : 'declined'}#utfordringa`);
}
