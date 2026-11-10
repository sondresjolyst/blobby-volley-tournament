import { getPool } from '@/lib/db';
import { isTrustedPost, readForm, seeOther } from '@/lib/http';
import { getCurrentAccount } from '@/lib/players/current';
import { parseNickname } from '@/lib/players/nickname';
import { renameAccount } from '@/lib/store/players';

const back = (query: string) => seeOther(`/me?${query}#kallenavn`);

/** Changes the nickname of the signed in account from the form on /me. Sends a signed out browser to sign-in. */
export async function POST(req: Request) {
    if (!isTrustedPost(req, process.env)) return back('nicknameError=form');
    const account = await getCurrentAccount();
    if (!account) return seeOther('/login');
    const nickname = parseNickname((await readForm(req)).nickname);
    if (!nickname.ok) return back(`nicknameError=nickname-${nickname.error}`);
    const result = await renameAccount(getPool(), account.accountId, nickname.nickname, nickname.key, new Date());
    if (!result.ok) return back(`nicknameError=${result.error}`);
    return back('nickname=changed');
}
