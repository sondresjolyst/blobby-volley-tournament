import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { matchOutcome, matchPlayers, matchTitle } from '@/components/matches/describe';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { matchErrorMessage, STATE_LABELS } from '@/lib/matches/input';
import { MATCH_STATES } from '@/lib/matches/state';
import { getActiveEvent } from '@/lib/store/events';
import { listMatches, type MatchSummary } from '@/lib/store/matches';
import { toSearchParams } from '@/lib/tournaments/input';

type Search = Record<string, string | string[] | undefined>;

/**
 * An upcoming match can be called once both players are known and a 1v1 match is accepted. An
 * accepted 1v1 match is called by itself when both players are free, so this is rarely needed for one.
 */
const canCall = (m: MatchSummary) => m.players[0] !== null && m.players[1] !== null && (m.tournamentId !== null || m.acceptedAt !== null);

export default async function AdminMatches({ searchParams }: { searchParams: Promise<Search> }) {
    await requireAdmin();
    const pool = getPool();
    const event = await getActiveEvent(pool);
    const matches = event ? await listMatches(pool, event.id) : [];
    const search = toSearchParams(await searchParams);
    const called = search.getAll('called');
    const failed = search.getAll('failed').map((value) => {
        const [id, code] = value.split(':');
        return { id, message: matchErrorMessage(code) ?? 'It could not be called.' };
    });
    const formError = matchErrorMessage(search.get('error') ?? undefined);
    return (
        <AdminShell section="matches">
            <h1>Matches</h1>
            {formError && <p role="alert">{formError}</p>}
            {called.length > 0 && <p role="status">Called match {called.join(', ')}.</p>}
            {failed.map((f) => (
                <p key={f.id} role="alert">
                    Match {f.id}: {f.message}
                </p>
            ))}
            {!event ? (
                <p>There is no active event.</p>
            ) : (
                <>
                    <p>Event: {event.name}</p>
                    {MATCH_STATES.map((state) => {
                        const inState = matches.filter((m) => m.state === state);
                        const table = (
                            <div className="admin-table">
                                <table>
                                    <thead>
                                        <tr>
                                            {state === 'upcoming' && <th>Call</th>}
                                            <th>Match</th>
                                            <th>Players</th>
                                            <th>Best of</th>
                                            <th>Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inState.map((m) => (
                                            <tr key={m.id}>
                                                {state === 'upcoming' && (
                                                    <td data-label="Call">
                                                        {canCall(m) && (
                                                            <input type="checkbox" name="match" value={m.id} aria-label={`Call match ${m.id}`} />
                                                        )}
                                                    </td>
                                                )}
                                                <td data-label="Match">
                                                    <Link href={`/admin/matches/${m.id}`}>
                                                        Match {m.id}: {matchTitle(m, 'admin')}
                                                    </Link>
                                                </td>
                                                <td data-label="Players">{matchPlayers(m, 'admin')}</td>
                                                <td data-label="Best of">{m.bestOf}</td>
                                                <td data-label="Score">{matchOutcome(m)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                        return (
                            <section key={state} aria-label={STATE_LABELS[state]}>
                                <h2>
                                    {STATE_LABELS[state]} ({inState.length})
                                </h2>
                                {inState.length === 0 ? (
                                    <p>None.</p>
                                ) : state === 'upcoming' ? (
                                    <form method="post" action="/api/admin/matches/call">
                                        {table}
                                        <button type="submit">Call the picked matches</button>
                                    </form>
                                ) : (
                                    table
                                )}
                            </section>
                        );
                    })}
                </>
            )}
        </AdminShell>
    );
}
