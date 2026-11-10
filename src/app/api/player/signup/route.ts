import { getPool } from '@/lib/db';
import { normalizeEventCode } from '@/lib/events/input';
import { clientBucket } from '@/lib/client-ip';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { parseNickname } from '@/lib/players/nickname';
import { isValidPin } from '@/lib/players/pin';
import { signUpPlayer } from '@/lib/store/players';
import { signedIn } from '@/lib/players/signed-in';

export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return seeOther('/join?error=form');
    const form = await readForm(req);
    const nickname = parseNickname(form.nickname);
    if (!nickname.ok) return seeOther(`/join?error=nickname-${nickname.error}`);
    if (!isValidPin(form.pin)) return seeOther('/join?error=pin');
    const result = await signUpPlayer(
        getPool(),
        { code: normalizeEventCode(form.code), nickname: nickname.nickname, nicknameKey: nickname.key, pin: form.pin },
        clientBucket(req.headers, process.env),
        new Date(),
    );
    if (!result.ok) return seeOther(`/join?error=${result.error}`);
    return signedIn(result.accountId);
}
