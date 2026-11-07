import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { listEvents } from '@/lib/store/events';

export default async function AdminEvents() {
    await requireAdmin();
    const events = await listEvents(getPool());
    return (
        <AdminShell section="events">
            <h1>Events</h1>
            <p>
                <Link href="/admin/events/new" className="admin-button">
                    New event
                </Link>
            </p>
            {events.length === 0 ? (
                <p>No events yet.</p>
            ) : (
                <div className="admin-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Dates</th>
                                <th>Code</th>
                                <th>Active</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((event) => (
                                <tr key={event.id}>
                                    <td data-label="Name">
                                        <Link href={`/admin/events/${event.id}`}>{event.name}</Link>
                                    </td>
                                    <td data-label="Dates">
                                        {event.startsOn} to {event.endsOn}
                                    </td>
                                    <td data-label="Code">{event.code}</td>
                                    <td data-label="Active">{event.isActive ? 'Active' : ''}</td>
                                    <td>
                                        {!event.isActive && (
                                            <form method="post" action={`/api/admin/events/${event.id}/activate`}>
                                                <button type="submit">Set active</button>
                                            </form>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {events.some((event) => event.isActive) && (
                <form method="post" action="/api/admin/events/deactivate">
                    <button type="submit">Close the active event</button>
                </form>
            )}
        </AdminShell>
    );
}
