import { getPool } from '@/lib/db';
import { isCrossSite, readForm, seeOther } from '@/lib/http';
import { parseNickname } from '@/lib/players/nickname';
import { signInPlayer } from '@/lib/store/players';
import { signedIn } from '@/lib/players/signed-in';

export async function POST(req: Request) {
    if (isCrossSite(req)) return seeOther('/login?error=form');
    const form = await readForm(req);
    const nickname = parseNickname(form.nickname);
    if (!nickname.ok) return seeOther('/login?error=wrong');
    const result = await signInPlayer(getPool(), nickname.key, form.pin ?? '', new Date());
    if (!result.ok) return seeOther(`/login?error=${result.error}`);
    return signedIn(result.playerId);
}
