import { getPool } from '@/lib/db';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { parseChallengeForm } from '@/lib/matches/input';
import { getActivePlayer } from '@/lib/players/current';
import { createChallenge } from '@/lib/store/matches';

/** Asks another player of the event for a 1v1 match from the form on /me. Sends a signed out browser to sign-in. */
export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther('/me?challengeError=form#utfordringa');
    const player = await getActivePlayer();
    if (!player) return seeOther('/login');
    const input = parseChallengeForm(await readForm(req));
    if (!input) return seeOther('/me?challengeError=form#utfordringa');
    const result = await createChallenge(getPool(), player.id, input.opponentId, { bestOf: input.bestOf, scoreToWin: input.scoreToWin, speed: input.speed });
    if (!result.ok) return seeOther(`/me?challengeError=${result.error}#utfordringa`);
    return seeOther('/me?challenge=sent#utfordringa');
}
