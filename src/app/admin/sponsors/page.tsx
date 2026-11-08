import { AdminShell } from '@/components/admin/AdminShell';
import { LibraryCards } from '@/components/sponsors/LibraryCards';
import { AddSponsor } from '@/components/sponsors/SponsorCards';
import { sponsorErrorMessage } from '@/components/sponsors/SponsorSection';
import { requireAdmin } from '@/lib/auth/options';
import { getPool } from '@/lib/db';
import { parseId } from '@/lib/http';
import { listLibrary, MAX_LIBRARY_SPONSORS } from '@/lib/store/sponsors';

type Search = { error?: string | string[]; saved?: string | string[]; deleted?: string | string[] };

/** The sponsor library: every sponsor once, for use at any event. */
export default async function SponsorLibrary({ searchParams }: { searchParams: Promise<Search> }) {
    await requireAdmin();
    const sponsors = await listLibrary(getPool());
    const search = await searchParams;
    const error = sponsorErrorMessage(search.error);
    const savedId = typeof search.saved === 'string' ? parseId(search.saved) : null;
    const saved = sponsors.find((sponsor) => sponsor.id === savedId);
    return (
        <AdminShell section="sponsors">
            <h1>Sponsor library</h1>
            <p>Add a sponsor here once, then add it to any event from the sponsors of that event.</p>
            {error && <p role="alert">{error}</p>}
            {saved && <p role="status">Saved the sponsor {saved.name}.</p>}
            {search.deleted === '1' && <p role="status">The sponsor is deleted from the library.</p>}
            {sponsors.length >= MAX_LIBRARY_SPONSORS && (
                <p role="note">
                    The library holds {sponsors.length} sponsors. A new sponsor can be added while it holds fewer than {MAX_LIBRARY_SPONSORS}. Delete sponsors that no event uses first.
                </p>
            )}
            {sponsors.length === 0 ? <p>No sponsors yet.</p> : <LibraryCards sponsors={sponsors} />}
            <AddSponsor action="/api/admin/library" withShown={false} />
        </AdminShell>
    );
}
