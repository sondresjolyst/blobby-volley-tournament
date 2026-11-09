import { getPool } from '@/lib/db';
import { isTrustedPost, parseId, seeOther } from '@/lib/http';
import { getActivePlayer } from '@/lib/players/current';
import { cancelTraining } from '@/lib/store/training';

/** The player stops their own open training match. Sends a signed out browser to sign-in. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    if (!isTrustedPost(req, process.env)) return seeOther('/trening?trainingError=form#tren');
    const player = await getActivePlayer();
    if (!player) return seeOther('/login');
    const id = parseId((await ctx.params).id);
    if (id === null) return seeOther('/trening?trainingError=not-found#tren');
    const result = await cancelTraining(getPool(), player.id, id);
    if (!result.ok) return seeOther(`/trening?trainingError=${result.error}#tren`);
    return seeOther('/trening?training=stopped#tren');
}
