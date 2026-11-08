'use client';

import { useRef, useState } from 'react';
import type { SponsorRow } from '@/lib/store/sponsors';
import { adminLogoSrc, SponsorForm, TILE_LOGO_HEIGHT, tileWidth } from './SponsorForm';
import { SponsorTile } from './SponsorTile';

/**
 * Turns a sponsor on or off. It posts the edit form with the current values, so only Shown changes
 * and the logo stays.
 */
function ShownSwitch({ sponsor }: { sponsor: SponsorRow }) {
    return (
        <form method="post" action={`/api/admin/sponsors/${sponsor.id}`} encType="multipart/form-data" className="admin-inline">
            <input type="hidden" name="name" value={sponsor.name} />
            <input type="hidden" name="link" value={sponsor.link ?? ''} />
            <input type="hidden" name="ownBackground" value={sponsor.gameBackground === null ? 'off' : 'on'} />
            <input type="hidden" name="gameBackground" value={sponsor.gameBackground ?? '#ffffff'} />
            {!sponsor.enabled && <input type="hidden" name="enabled" value="on" />}
            <button type="submit" role="switch" aria-checked={sponsor.enabled} aria-label={`Shown: ${sponsor.name}`} className="admin-switch">
                <span className="admin-switch-track" aria-hidden="true" />
                Shown
            </button>
        </form>
    );
}

/** One sponsor: its tile, name and link, and the buttons to show, move, edit and delete it. */
function SponsorCard({ sponsor, first, last }: { sponsor: SponsorRow; first: boolean; last: boolean }) {
    const [editing, setEditing] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const editButton = useRef<HTMLButtonElement>(null);
    const deleteButton = useRef<HTMLButtonElement>(null);
    const closeEdit = () => {
        setEditing(false);
        // The button is back after the render, so focus waits a frame.
        requestAnimationFrame(() => editButton.current?.focus());
    };
    const cancelDelete = () => {
        setConfirming(false);
        requestAnimationFrame(() => deleteButton.current?.focus());
    };
    return (
        <li className="admin-sponsor" data-hidden={!sponsor.enabled || undefined}>
            <div className="admin-sponsor-row">
                <SponsorTile src={adminLogoSrc(sponsor)} alt={`Logo of ${sponsor.name}`} height={TILE_LOGO_HEIGHT} width={tileWidth(sponsor)} background={sponsor.gameBackground} />
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
                        <button ref={editButton} type="button" aria-label={`Edit ${sponsor.name}`} className="admin-quiet" onClick={() => setEditing(true)}>
                            Edit
                        </button>
                    )}
                    {!confirming && (
                        <button ref={deleteButton} type="button" aria-label={`Delete ${sponsor.name}`} className="admin-quiet" onClick={() => setConfirming(true)}>
                            Delete
                        </button>
                    )}
                </div>
            </div>
            {confirming && (
                <form method="post" action={`/api/admin/sponsors/${sponsor.id}/delete`} className="admin-confirm" role="group" aria-label={`Delete ${sponsor.name}?`}>
                    <span>Delete {sponsor.name}? This cannot be undone.</span>
                    {/* The admin asked for this button, so it takes the focus. */}
                    <button type="submit" autoFocus>
                        Yes, delete
                    </button>
                    <button type="button" className="admin-quiet" onClick={cancelDelete}>
                        Cancel
                    </button>
                </form>
            )}
            {editing && <SponsorForm action={`/api/admin/sponsors/${sponsor.id}`} sponsor={sponsor} title={`Edit ${sponsor.name}`} submitLabel="Save" onCancel={closeEdit} />}
        </li>
    );
}

/** The sponsors of an event as cards, in the order the site and the game show them. */
export function SponsorCards({ sponsors }: { sponsors: SponsorRow[] }) {
    return (
        <ul className="admin-sponsors">
            {sponsors.map((sponsor, index) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} first={index === 0} last={index === sponsors.length - 1} />
            ))}
        </ul>
    );
}

/** The Add sponsor button, which opens the sponsor form. */
export function AddSponsor({ eventId }: { eventId: number }) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    if (open) {
        return (
            <SponsorForm
                action={`/api/admin/events/${eventId}/sponsors`}
                title="Add a sponsor"
                submitLabel="Add sponsor"
                onCancel={() => {
                    setOpen(false);
                    requestAnimationFrame(() => button.current?.focus());
                }}
            />
        );
    }
    return (
        <button ref={button} type="button" onClick={() => setOpen(true)}>
            Add sponsor
        </button>
    );
}
