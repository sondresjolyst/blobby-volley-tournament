import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { matchPlayers, matchTitle, stoppedGame } from '@/components/matches/describe';
import { requireAdmin } from '@/lib/auth/options';
import { bigScreenHref } from '@/lib/big-screen/key';
import { getPool } from '@/lib/db';
import { listAwaitingDecision } from '@/lib/store/matches';

export default async function Admin() {
    const session = await requireAdmin();
    const waiting = await listAwaitingDecision(getPool());
    return (
        <main>
            <h1>Admin</h1>
            <section aria-labelledby="waiting">
                <h2 id="waiting">Waiting for a decision</h2>
                {waiting.length === 0 ? (
                    <p>No match waits for a decision.</p>
                ) : (
                    <>
                        <p>The game server stopped these games without a winner. Open a match to restart the game from 0-0 or award it.</p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Event</th>
                                    <th>Match</th>
                                    <th>Players</th>
                                    <th>Stopped</th>
                                    <th>Decide</th>
                                </tr>
                            </thead>
                            <tbody>
                                {waiting.map((match) => (
                                    <tr key={match.id}>
                                        <td>{match.eventName}</td>
                                        <td>{matchTitle(match)}</td>
                                        <td>{matchPlayers(match)}</td>
                                        <td>{stoppedGame(match, match.game)}</td>
                                        <td>
                                            <Link href={`/admin/matches/${match.id}`}>Open match {match.id}</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </section>
            <p>Signed in as {session.user?.name ?? 'admin'}.</p>
            <p>
                <Link href="/admin/events">Events</Link> | <Link href="/admin/tournaments">Tournaments</Link> | <Link href="/admin/matches">Matches</Link> | <Link href={bigScreenHref(process.env)}>Big screen</Link>
            </p>
            <SignOutButton />
        </main>
    );
}
