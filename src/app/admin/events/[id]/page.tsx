import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventForm, eventErrorMessage } from '@/components/events/EventForm';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { getEvent } from '@/lib/store/events';
import { listPlayers } from '@/lib/store/players';

type Search = { error?: string | string[]; saved?: string | string[]; reset?: string | string[] };

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
    await requireAdmin();
    const id = parseId((await params).id);
    if (id === null) notFound();
    const pool = getPool();
    const event = await getEvent(pool, id);
    if (!event) notFound();
    const players = await listPlayers(pool, id);
    const search = await searchParams;
    const message = eventErrorMessage(search.error);
    const resetId = typeof search.reset === 'string' ? parseId(search.reset) : null;
    const resetPlayer = players.find((player) => player.id === resetId);
    const now = new Date();
    return (
        <main>
            <h1>{event.name}</h1>
            <p>
                <Link href="/admin/events">Events</Link>
            </p>
            <p>{event.isActive ? 'This is the active event.' : 'This event is not active.'}</p>
            {!event.isActive && (
                <form method="post" action={`/api/admin/events/${event.id}/activate`}>
                    <button type="submit">Set active</button>
                </form>
            )}
            {message && <p role="alert">{message}</p>}
            {search.saved === '1' && <p role="status">Saved.</p>}
            {resetPlayer && <p role="status">The PIN for {resetPlayer.nickname} is reset.</p>}

            <h2>Edit event</h2>
            <EventForm action={`/api/admin/events/${event.id}`} event={event} submitLabel="Save" />

            <h2>Players</h2>
            {players.length === 0 ? (
                <p>No players yet.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Nickname</th>
                            <th>Foza</th>
                            <th>Locked</th>
                            <th>Reset PIN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.map((player) => (
                            <tr key={player.id}>
                                <td>{player.nickname}</td>
                                <td>{player.fozaBalance}</td>
                                <td>{player.lockedUntil && player.lockedUntil > now ? `Until ${player.lockedUntil.toISOString()}` : ''}</td>
                                <td>
                                    <form method="post" action={`/api/admin/players/${player.id}/pin`}>
                                        <input type="hidden" name="eventId" value={event.id} />
                                        <label>
                                            New PIN for {player.nickname}{' '}
                                            <input name="pin" type="password" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" />
                                        </label>{' '}
                                        <button type="submit">Reset PIN</button>
                                    </form>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </main>
    );
}
