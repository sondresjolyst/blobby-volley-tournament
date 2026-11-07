import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getBigScreen } from '@/lib/store/big-screen';

/**
 * What the big screen shows, for its own refresh. Public. `?t=<id>` picks the tournament of the
 * bracket. The event code is only in the answer with `?key=` set to the big screen key of the active event.
 */
export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;
    const t = params.get('t');
    const data = await getBigScreen(getPool(), t === null ? null : parseId(t), params.get('key'));
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
