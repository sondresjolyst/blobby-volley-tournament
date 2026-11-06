import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { parseMatchIds } from '@/lib/matches/input';
import { callMatches } from '@/lib/store/matches';

/** Calls the matches picked on /admin/matches. Each match is called on its own. */
export async function POST(req: Request) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        form = new FormData();
    }
    const ids = parseMatchIds(form.getAll('match').filter((value): value is string => typeof value === 'string'));
    if (ids.length === 0) return seeOther('/admin/matches?error=form');
    const results = await callMatches(getPool(), ids);
    const params = new URLSearchParams();
    for (const { matchId, result } of results) {
        if (result.ok) params.append('called', String(matchId));
        else params.append('failed', `${matchId}:${result.error}`);
    }
    return seeOther(`/admin/matches?${params}`);
}
