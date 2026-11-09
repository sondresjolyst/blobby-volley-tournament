import { getPool } from '@/lib/db';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { getActivePlayer } from '@/lib/players/current';
import { createTraining } from '@/lib/store/training';
import { parseTrainingForm } from '@/lib/training/settings';

/** Starts a training match against the bot of the game server from the form on /trening. Sends a signed out browser to sign-in. */
export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther('/trening?trainingError=form#tren');
    const player = await getActivePlayer();
    if (!player) return seeOther('/login');
    const input = parseTrainingForm(await readForm(req));
    if (!input) return seeOther('/trening?trainingError=settings#tren');
    const result = await createTraining(getPool(), player.id, input);
    if (!result.ok) return seeOther(`/trening?trainingError=${result.error}#tren`);
    return seeOther('/trening?training=started#tren');
}
