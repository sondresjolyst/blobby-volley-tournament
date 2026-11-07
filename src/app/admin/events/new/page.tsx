import { AdminShell } from '@/components/admin/AdminShell';
import { EventForm, eventErrorMessage } from '@/components/events/EventForm';
import { requireAdmin } from '@/lib/auth/options';
import { randomEventCode } from '@/lib/events/code';

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    await requireAdmin();
    const message = eventErrorMessage((await searchParams).error);
    return (
        <AdminShell section="events">
            <h1>New event</h1>
            {message && <p role="alert">{message}</p>}
            <EventForm action="/api/admin/events" submitLabel="Create event" suggestedCode={randomEventCode()} />
        </AdminShell>
    );
}
