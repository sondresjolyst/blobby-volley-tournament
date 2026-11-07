import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { FORMATS } from '@/lib/bracket';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { getActiveEvent } from '@/lib/store/events';
import { listTournaments } from '@/lib/store/tournaments';

export default async function AdminTournaments() {
    await requireAdmin();
    const pool = getPool();
    const event = await getActiveEvent(pool);
    const tournaments = event ? await listTournaments(pool, event.id) : [];
    return (
        <AdminShell section="tournaments">
            <h1>Tournaments</h1>
            {event && (
                <p>
                    <Link href="/admin/tournaments/new">New tournament</Link>
                </p>
            )}
            {!event ? (
                <p>There is no active event. Set an event active to add tournaments.</p>
            ) : (
                <>
                    <p>Event: {event.name}</p>
                    {tournaments.length === 0 ? (
                        <p>No tournaments yet.</p>
                    ) : (
                        <div className="admin-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Format</th>
                                        <th>Players</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tournaments.map((t) => (
                                        <tr key={t.id}>
                                            <td>
                                                <Link href={`/admin/tournaments/${t.id}`}>{t.name}</Link>
                                            </td>
                                            <td>{FORMATS[t.format].name}</td>
                                            <td>{t.playerCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </AdminShell>
    );
}
