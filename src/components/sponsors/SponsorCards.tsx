'use client';

import type { SponsorRow } from '@/lib/store/sponsors';
import { adminLogoSrc, SponsorForm } from './SponsorForm';
import { ConfirmBox, useOpenClose } from './InPlace';
import { SponsorTile } from './SponsorTile';

/** Turns a sponsor on or off. It posts only the new state, so an edit made meanwhile is kept. */
function ShownSwitch({ sponsor }: { sponsor: SponsorRow }) {
    return (
        <form method="post" action={`/api/admin/sponsors/${sponsor.id}/shown`} className="admin-inline">
            <input type="hidden" name="enabled" value={sponsor.enabled ? 'off' : 'on'} />
            <button type="submit" role="switch" aria-checked={sponsor.enabled} aria-label={`Shown: ${sponsor.name}`} className="admin-switch">
                <span className="admin-switch-track" aria-hidden="true" />
                Shown
            </button>
        </form>
    );
}

/** One sponsor at the event: its tile, name and link, and the buttons to show, move, edit and remove it. */
function SponsorCard({ sponsor, first, last, usedElsewhere }: { sponsor: SponsorRow; first: boolean; last: boolean; usedElsewhere: boolean }) {
    const { isOpen: editing, trigger: editButton, open: openEdit, close: closeEdit } = useOpenClose();
    const { isOpen: removing, trigger: removeButton, open: openRemove, close: closeRemove } = useOpenClose();
    return (
        <li className="admin-sponsor" data-hidden={!sponsor.enabled || undefined}>
            <div className="admin-sponsor-row">
                <SponsorTile sponsor={{ name: sponsor.name, src: adminLogoSrc(sponsor), background: sponsor.gameBackground }} alt={`Logo of ${sponsor.name}`} />
                <div className="admin-sponsor-text">
                    <strong>
                        {sponsor.name}
                        {!sponsor.enabled && <span className="admin-badge">Hidden</span>}
                    </strong>
                    {sponsor.link ? <span className="admin-sponsor-link">{sponsor.link}</span> : <span className="admin-hint">No link</span>}
                </div>
                <div className="admin-sponsor-actions">
                    <ShownSwitch sponsor={sponsor} />
                    <form method="post" action={`/api/admin/sponsors/${sponsor.id}/move`} className="admin-inline">
                        <button type="submit" name="direction" value="up" disabled={first} aria-label={`Move ${sponsor.name} up`} className="admin-quiet">
                            Up
                        </button>
                        <button type="submit" name="direction" value="down" disabled={last} aria-label={`Move ${sponsor.name} down`} className="admin-quiet">
                            Down
                        </button>
                    </form>
                    {!editing && (
                        <button ref={editButton} type="button" aria-label={`Edit ${sponsor.name}`} className="admin-quiet" onClick={openEdit}>
                            Edit
                        </button>
                    )}
                    {!removing && (
                        <button ref={removeButton} type="button" aria-label={`Remove ${sponsor.name}`} className="admin-quiet" onClick={openRemove}>
                            Remove
                        </button>
                    )}
                </div>
            </div>
            {removing && (
                <ConfirmBox
                    action={`/api/admin/sponsors/${sponsor.id}/delete`}
                    label={`Remove ${sponsor.name}?`}
                    question={`Remove ${sponsor.name} from this event? It stays in the sponsor library.`}
                    yes="Yes, remove"
                    onCancel={closeRemove}
                />
            )}
            {editing && (
                <SponsorForm
                    action={`/api/admin/sponsors/${sponsor.id}`}
                    sponsor={{ ...sponsor, logoSrc: adminLogoSrc(sponsor) }}
                    title={`Edit ${sponsor.name}`}
                    submitLabel="Save"
                    onCancel={closeEdit}
                    note={usedElsewhere ? 'Other events use this sponsor too. The name, link, logo and colour change there as well. Shown is for this event only.' : undefined}
                />
            )}
        </li>
    );
}

/**
 * The sponsors of an event as cards, in the order the site and the game show them. `shared` holds
 * the library ids that other events use too.
 */
export function SponsorCards({ sponsors, shared }: { sponsors: SponsorRow[]; shared: number[] }) {
    return (
        <ul className="admin-sponsors">
            {sponsors.map((sponsor, index) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} first={index === 0} last={index === sponsors.length - 1} usedElsewhere={shared.includes(sponsor.libraryId)} />
            ))}
        </ul>
    );
}

/** The Add sponsor button, which opens the sponsor form. It posts to `action`, for an event or for the library. */
export function AddSponsor({ action, withShown = true }: { action: string; withShown?: boolean }) {
    const { isOpen, trigger, open, close } = useOpenClose();
    if (isOpen) return <SponsorForm action={action} title="Add a sponsor" submitLabel="Add sponsor" onCancel={close} withShown={withShown} />;
    return (
        <button ref={trigger} type="button" onClick={open}>
            Add sponsor
        </button>
    );
}
