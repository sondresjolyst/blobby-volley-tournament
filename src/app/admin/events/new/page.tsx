import Link from 'next/link';
import { EventForm, eventErrorMessage } from '@/components/events/EventForm';
import { requireAdmin } from '@/lib/auth/options';

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    await requireAdmin();
    const message = eventErrorMessage((await searchParams).error);
    return (
        <main>
            <h1>New event</h1>
            <p>
                <Link href="/admin/events">Events</Link>
            </p>
            {message && <p role="alert">{message}</p>}
            <EventForm action="/api/admin/events" submitLabel="Create event" />
        </main>
    );
}
