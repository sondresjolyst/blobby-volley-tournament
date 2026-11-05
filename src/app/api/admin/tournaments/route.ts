import { requireAdminApi } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { seeOther } from '@/lib/http';
import { getActiveEvent } from '@/lib/store/events';
import { saveTournament } from '@/lib/store/tournaments';
import { fieldsOf, parseTournamentDraft, planTournament } from '@/lib/tournaments/input';

/** Saves the tournament from the form on /admin/tournaments/new in the active event. */
export async function POST(req: Request) {
    const admin = await requireAdminApi(req);
    if (admin instanceof Response) return admin;
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        form = new FormData();
    }
    // On an error the admin goes back to the form with the same values.
    const back = (error: string) => {
        const params = new URLSearchParams();
        for (const [key, value] of form) if (typeof value === 'string' && key !== 'error') params.append(key, value);
        params.set('error', error);
        return seeOther(`/admin/tournaments/new?${params}`);
    };
    const draft = parseTournamentDraft(fieldsOf(form));
    if (!draft.ok) return back(draft.error);
    const pool = getPool();
    const event = await getActiveEvent(pool);
    if (!event) return back('no-event');
    const bracket = planTournament(draft.value);
    const result = await saveTournament(pool, event.id, {
        name: draft.value.name,
        seeding: draft.value.seeding,
        randomSeed: draft.value.seeding === 'random' ? draft.value.randomSeed : null,
        bracket,
    });
    if (!result.ok) return back(result.error);
    return seeOther(`/admin/tournaments/${result.id}?saved=1`);
}
