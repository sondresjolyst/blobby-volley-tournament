import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFields, listHref, Pager, type ListState } from '@/components/admin/Pager';
import { matchOutcome, matchPlayers, matchTitle } from '@/components/matches/describe';
import { NO_ACTIVE_EVENT } from '@/lib/admin-texts';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { matchErrorMessage, STATE_LABELS } from '@/lib/matches/input';
import { MATCH_STATES, type MatchState } from '@/lib/matches/state';
import { MAX_SEARCH, matchesSearch, pageOf, parsePage, parseSearch, type Page } from '@/lib/paging';
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
        return { id, message: matchErrorMessage(code) ?? 'Could not call this match. Try again.' };
    });
    const formError = matchErrorMessage(search.get('error') ?? undefined);
    const q = parseSearch(search.get('q') ?? undefined);
    const found = matches.filter((m) => matchesSearch(q, `Match ${m.id}`, matchTitle(m, 'admin'), matchPlayers(m, 'admin')));
    // Each section has its own page, such as ?upcoming=2. The forms send the pages that are shown.
    const lists = Object.fromEntries(
        MATCH_STATES.map((state) => [
            state,
            pageOf(
                found.filter((m) => m.state === state),
                parsePage(search.get(state) ?? undefined),
            ),
        ]),
    ) as Record<MatchState, Page<MatchSummary>>;
    const shown: ListState = { pages: Object.fromEntries(MATCH_STATES.map((state) => [state, lists[state].page])), q };
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
                <p>{NO_ACTIVE_EVENT}</p>
            ) : (
                <>
                    <p>Event: {event.name}</p>
                    <form role="search" method="get" action="/admin/matches" className="admin-search" aria-label="Matches">
                        <label>
                            Search by match, tournament or player{' '}
                            <input type="search" name="q" defaultValue={q} maxLength={MAX_SEARCH} autoComplete="off" spellCheck={false} />
                        </label>
                        <button type="submit">Search</button>
                        {q !== '' && <Link href="/admin/matches">Show all matches</Link>}
                    </form>
                    {MATCH_STATES.map((state) => {
                        const list = lists[state];
                        const table = (
                            <div className="admin-table admin-matches">
                                <table>
                                    <thead>
                                        <tr>
                                            {state === 'upcoming' && <th className="admin-matches-call">Call</th>}
                                            <th>Match</th>
                                            <th className="admin-matches-players">Players</th>
                                            <th className="admin-matches-best">Best of</th>
                                            <th className="admin-matches-score">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {list.items.map((m) => (
                                            <tr key={m.id}>
                                                {state === 'upcoming' && (
                                                    <td data-label="Call">
                                                        {canCall(m) && <input type="checkbox" name="match" value={m.id} aria-label={`Call match ${m.id}`} />}
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
                        const pager =
                            list.pages > 1 ? (
                                <Pager
                                    label={`Pages of ${STATE_LABELS[state].toLowerCase()} matches`}
                                    noun={['match', 'matches']}
                                    list={list}
                                    href={(page) => listHref('/admin/matches', shown, state, page, state)}
                                />
                            ) : null;
                        return (
                            <section key={state} id={state} aria-label={STATE_LABELS[state]}>
                                <h2>
                                    {STATE_LABELS[state]} ({list.total})
                                </h2>
                                {state === 'upcoming' && <p>An accepted 1v1 match is called by the site as soon as both players are free.</p>}
                                {list.total === 0 ? (
                                    <p>No matches.</p>
                                ) : state === 'upcoming' ? (
                                    <form method="post" action="/api/admin/matches/call">
                                        <ListFields state={shown} />
                                        {table}
                                        <button type="submit">Call selected matches</button>
                                    </form>
                                ) : (
                                    table
                                )}
                                {pager}
                            </section>
                        );
                    })}
                </>
            )}
        </AdminShell>
    );
}
