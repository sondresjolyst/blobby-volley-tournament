import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { matchPlayers, matchTitle, stoppedGame } from '@/components/matches/describe';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { listAwaitingDecision } from '@/lib/store/matches';

export default async function Admin() {
    await requireAdmin();
    const waiting = await listAwaitingDecision(getPool());
    return (
        <AdminShell section="home">
            <h1>Admin</h1>
            <section aria-labelledby="waiting">
                <h2 id="waiting">Waiting for a decision</h2>
                {waiting.length === 0 ? (
                    <p>No match waits for a decision.</p>
                ) : (
                    <>
                        <p>The game server stopped these games without a winner. Open a match to restart the game from 0-0 or award it.</p>
                        <div className="admin-table">
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
                                            <td data-label="Event">{match.eventName}</td>
                                            <td data-label="Match">{matchTitle(match, 'admin')}</td>
                                            <td data-label="Players">{matchPlayers(match, 'admin')}</td>
                                            <td data-label="Stopped">{stoppedGame(match, match.game)}</td>
                                            <td>
                                                <Link href={`/admin/matches/${match.id}`}>Open match {match.id}</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </AdminShell>
    );
}
