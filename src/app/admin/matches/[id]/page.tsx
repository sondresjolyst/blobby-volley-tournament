import Link from 'next/link';
import { notFound } from 'next/navigation';
import { matchOutcome, matchPlayers, matchTitle } from '@/components/matches/describe';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { matchErrorMessage, STATE_LABELS } from '@/lib/matches/input';
import { winsNeeded } from '@/lib/matches/state';
import { getMatch } from '@/lib/store/matches';

type Search = { error?: string | string[]; done?: string | string[]; blocked?: string | string[] };

const DONE: Record<string, string> = {
    call: 'The match is called.',
    restart: 'The game restarts from 0-0.',
    game: 'The game result is saved.',
    score: 'The series score is saved.',
    'no-show': 'The no-show is recorded.',
    cancel: 'The match is cancelled.',
    reset: 'The match is back to upcoming. Its games are cleared.',
};

export default async function AdminMatch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
    await requireAdmin();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const match = await getMatch(getPool(), id);
    if (!match) notFound();
    const search = await searchParams;
    const error = matchErrorMessage(search.error);
    const blocked = search.error === 'downstream-played' && typeof search.blocked === 'string' ? parseId(search.blocked) : null;
    const done = typeof search.done === 'string' && Object.hasOwn(DONE, search.done) ? DONE[search.done] : null;
    const action = `/api/admin/matches/${match.id}`;
    const name = (slot: 1 | 2) => match.players[slot - 1]?.nickname ?? `Player ${slot}`;
    const bothKnown = match.players[0] !== null && match.players[1] !== null;
    const open = match.state === 'upcoming' || match.state === 'called' || match.state === 'started';
    const scorable = match.result !== 'forfeit' && (match.state === 'called' || match.state === 'started' || match.state === 'finished');
    return (
        <main>
            <h1>Match {match.id}</h1>
            <p>
                <Link href="/admin/matches">Matches</Link>
                {match.tournamentId !== null && (
                    <>
                        {' '}
                        | <Link href={`/admin/tournaments/${match.tournamentId}`}>Tournament</Link>
                    </>
                )}
            </p>
            {error && (
                <p role="alert">
                    {error}
                    {blocked !== null && (
                        <>
                            {' '}
                            It is <Link href={`/admin/matches/${blocked}`}>match {blocked}</Link>. Reset it there and come back.
                        </>
                    )}
                </p>
            )}
            {done && <p role="status">{done}</p>}
            <p>{matchTitle(match)}</p>
            <p>{matchPlayers(match)}</p>
            <p>State: {STATE_LABELS[match.state]}</p>
            <p>
                Best of {match.bestOf}, first to {winsNeeded(match.bestOf)}. Rules: {match.ruleFile}
            </p>
            <p>
                Games to {match.scoreToWin} points at {match.speed} frames per second.
            </p>
            <p>Series: {matchOutcome(match)}</p>
            {match.manualScore && (
                <p>
                    The series score was set by hand to {match.manualScore.score1}-{match.manualScore.score2} after game {match.manualScore.afterGame}.
                </p>
            )}
            {match.tournamentId === null && match.state === 'upcoming' && <p>{match.acceptedAt ? 'Accepted by the other player.' : 'Waiting for the other player to accept.'}</p>}
            {match.awaitingDecision && <p role="alert">The last game was abandoned. Restart it from 0-0 or award it.</p>}

            <h2>Games</h2>
            {match.games.length === 0 ? (
                <p>No games yet.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Game</th>
                            <th>Result</th>
                            <th>Points</th>
                            <th>Entered by</th>
                        </tr>
                    </thead>
                    <tbody>
                        {match.games.map((g) => (
                            <tr key={g.number}>
                                <td>{g.number}</td>
                                <td>{g.winnerSlot === null ? 'Abandoned' : `${name(g.winnerSlot)} won`}</td>
                                <td>
                                    {g.points1}-{g.points2}
                                </td>
                                <td>{g.source === 'admin' ? 'Admin' : 'Game server'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <h2>Tools</h2>
            {match.state === 'upcoming' && (
                <form method="post" action={action}>
                    <input type="hidden" name="action" value="call" />
                    <button type="submit">Call match</button>
                </form>
            )}
            {match.state === 'started' && (
                <form method="post" action={action}>
                    <input type="hidden" name="action" value="restart" />
                    <button type="submit">Restart current game</button>
                </form>
            )}
            {scorable && (
                <>
                    <h3>Enter or correct a game result</h3>
                    <form method="post" action={action}>
                        <input type="hidden" name="action" value="game" />
                        <label>
                            Game number <input name="game" type="number" min={1} max={match.nextGame} defaultValue={match.nextGame} required />
                        </label>{' '}
                        <label>
                            Result{' '}
                            <select name="winner" defaultValue="1">
                                <option value="1">{name(1)} won</option>
                                <option value="2">{name(2)} won</option>
                                <option value="abandoned">Abandoned</option>
                            </select>
                        </label>{' '}
                        <label>
                            Points for {name(1)} <input name="points1" type="number" min={0} max={1000} required />
                        </label>{' '}
                        <label>
                            Points for {name(2)} <input name="points2" type="number" min={0} max={1000} required />
                        </label>{' '}
                        <button type="submit">Save game</button>
                    </form>
                    <h3>Set the series score</h3>
                    <form method="post" action={action}>
                        <input type="hidden" name="action" value="score" />
                        <label>
                            Games won by {name(1)} <input name="score1" type="number" min={0} max={winsNeeded(match.bestOf)} defaultValue={match.score1} required />
                        </label>{' '}
                        <label>
                            Games won by {name(2)} <input name="score2" type="number" min={0} max={winsNeeded(match.bestOf)} defaultValue={match.score2} required />
                        </label>{' '}
                        <button type="submit">Save series score</button>
                    </form>
                </>
            )}
            {open && bothKnown && (
                <>
                    <h3>Record a no-show</h3>
                    <form method="post" action={action}>
                        <input type="hidden" name="action" value="no-show" />
                        <label>
                            Player who did not show up{' '}
                            <select name="absent" defaultValue="1">
                                <option value="1">{name(1)}</option>
                                <option value="2">{name(2)}</option>
                            </select>
                        </label>{' '}
                        <button type="submit">Record no-show</button>
                    </form>
                </>
            )}
            {(match.state === 'called' || match.state === 'started' || match.state === 'finished') && (
                <>
                    <h3>Reset to upcoming</h3>
                    <p>This clears the games and the series score and refunds the bets on this match.</p>
                    <form method="post" action={action}>
                        <input type="hidden" name="action" value="reset" />
                        <button type="submit">Reset to upcoming</button>
                    </form>
                </>
            )}
            {open && match.tournamentId === null && (
                <form method="post" action={action}>
                    <input type="hidden" name="action" value="cancel" />
                    <button type="submit">Cancel match</button>
                </form>
            )}
        </main>
    );
}
