import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { readForm } from '@/lib/http';
import { createGameServerToken, getGameServerTokenInfo } from '@/lib/store/game-server-token';

/**
 * Makes a new game server token, from /admin/game-server. When there is a token already, the form
 * must have the confirm box checked, since the old token stops working at once. The answer holds
 * the token, the only time it is shown, so it is not cached.
 */
export async function POST(req: Request) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    const pool = getPool();
    const form = await readForm(req);
    if ((await getGameServerTokenInfo(pool)) !== null && form.confirm !== 'yes') return Response.json({ error: 'confirm' }, { status: 400 });
    const { token, createdAt } = await createGameServerToken(pool);
    return Response.json({ token, createdAt: createdAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
