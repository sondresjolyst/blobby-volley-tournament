import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getBigScreen } from '@/lib/store/big-screen';

/** What the big screen shows, for its own refresh. Public. `?t=<id>` picks the tournament of the bracket. */
export async function GET(req: Request) {
    const t = new URL(req.url).searchParams.get('t');
    const data = await getBigScreen(getPool(), t === null ? null : parseId(t));
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
