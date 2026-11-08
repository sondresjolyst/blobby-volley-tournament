'use client';

import Link from 'next/link';
import type { LibrarySponsor } from '@/lib/store/sponsors';
import { ConfirmBox, useOpenClose } from './InPlace';
import { libraryLogoSrc, SponsorForm } from './SponsorForm';
import { SponsorTile } from './SponsorTile';

/** One sponsor in the library: its tile, name and link, the events that use it, and Edit and Delete. */
function LibraryCard({ sponsor }: { sponsor: LibrarySponsor }) {
    const { isOpen: editing, trigger: editButton, open: openEdit, close: closeEdit } = useOpenClose();
    const { isOpen: deleting, trigger: deleteButton, open: openDelete, close: closeDelete } = useOpenClose();
    const used = sponsor.events.length > 0;
    return (
        <li className="admin-sponsor">
            <div className="admin-sponsor-row">
                <SponsorTile sponsor={{ name: sponsor.name, src: libraryLogoSrc(sponsor), background: sponsor.gameBackground }} alt={`Logo of ${sponsor.name}`} />
                <div className="admin-sponsor-text">
                    <strong>{sponsor.name}</strong>
                    {sponsor.link ? <span className="admin-sponsor-link">{sponsor.link}</span> : <span className="admin-hint">No link</span>}
                    <span className="admin-hint">
                        {used ? 'Used at ' : 'Not used at any event'}
                        {sponsor.events.map((event, index) => (
                            <span key={event.id}>
                                {index > 0 && ', '}
                                <Link href={`/admin/events/${event.id}#sponsors`}>{event.name}</Link>
                            </span>
                        ))}
                    </span>
                </div>
                <div className="admin-sponsor-actions">
                    {!editing && (
                        <button ref={editButton} type="button" aria-label={`Edit ${sponsor.name}`} className="admin-quiet" onClick={openEdit}>
                            Edit
                        </button>
                    )}
                    {!deleting && (
                        <button
                            ref={deleteButton}
                            type="button"
                            aria-label={`Delete ${sponsor.name}`}
                            aria-describedby={used ? `in-use-${sponsor.id}` : undefined}
                            className="admin-quiet"
                            disabled={used}
                            onClick={openDelete}
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
            {used && (
                <p id={`in-use-${sponsor.id}`} className="admin-hint">
                    Remove it from its events before you delete it.
                </p>
            )}
            {deleting && (
                <ConfirmBox
                    action={`/api/admin/library/${sponsor.id}/delete`}
                    label={`Delete ${sponsor.name}?`}
                    question={`Delete ${sponsor.name} from the library? This cannot be undone.`}
                    yes="Yes, delete"
                    onCancel={closeDelete}
                />
            )}
            {editing && (
                <SponsorForm
                    action={`/api/admin/library/${sponsor.id}`}
                    sponsor={{ ...sponsor, logoSrc: libraryLogoSrc(sponsor) }}
                    title={`Edit ${sponsor.name}`}
                    submitLabel="Save"
                    onCancel={closeEdit}
                    withShown={false}
                    note={used ? 'Every event that uses this sponsor shows the change.' : undefined}
                />
            )}
        </li>
    );
}

/** The sponsors in the library as cards, by name. */
export function LibraryCards({ sponsors }: { sponsors: LibrarySponsor[] }) {
    return (
        <ul className="admin-sponsors">
            {sponsors.map((sponsor) => (
                <LibraryCard key={sponsor.id} sponsor={sponsor} />
            ))}
        </ul>
    );
}
