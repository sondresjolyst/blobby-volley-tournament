import { requireAdminPost } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { parseMatchIds } from '@/lib/matches/input';
import { MATCH_STATES } from '@/lib/matches/state';
import { keptListQuery, withListQuery } from '@/lib/paging';
import { callMatches } from '@/lib/store/matches';

/** Calls the matches picked on /admin/matches. Each match is called on its own. */
export async function POST(req: Request) {
    const admin = await requireAdminPost(req);
    if (admin instanceof Response) return admin;
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        form = new FormData();
    }
    const ids = parseMatchIds(form.getAll('match').filter((value): value is string => typeof value === 'string'));
    // The pages and the search of the lists, so the admin comes back to the same pages.
    const text = (key: string) => {
        const value = form.get(key);
        return typeof value === 'string' ? value : undefined;
    };
    const kept = keptListQuery(Object.fromEntries([...MATCH_STATES, 'q'].map((key) => [key, text(key)])), MATCH_STATES);
    if (ids.length === 0) return seeOther(withListQuery('/admin/matches', kept, 'error=form'));
    const results = await callMatches(getPool(), ids);
    const params = new URLSearchParams();
    for (const { matchId, result } of results) {
        if (result.ok) params.append('called', String(matchId));
        else params.append('failed', `${matchId}:${result.error}`);
    }
    return seeOther(withListQuery('/admin/matches', kept, params.toString()));
}
