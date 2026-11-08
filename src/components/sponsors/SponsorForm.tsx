'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FileField } from '@/components/admin/FileField';
import { InfoButton } from '@/components/InfoButton';
import { MAX_LINK_LENGTH, MAX_NAME_LENGTH } from '@/lib/sponsors/input';
import { LOGO_ACCEPT, LOGO_HINT } from '@/lib/sponsors/limits';
import type { LibrarySponsor, SponsorRow } from '@/lib/store/sponsors';
import { SponsorTile } from './SponsorTile';

/** The height of a logo in the admin tiles, in pixels. */
export const TILE_LOGO_HEIGHT = 40;

export const tileWidth = (sponsor: { logoWidth: number; logoHeight: number }) => Math.round((TILE_LOGO_HEIGHT * sponsor.logoWidth) / sponsor.logoHeight);

export const adminLogoSrc = (sponsor: SponsorRow) => `/api/admin/sponsors/${sponsor.id}/logo?v=${sponsor.logoHash}`;

export const libraryLogoSrc = (sponsor: LibrarySponsor) => `/api/admin/library/${sponsor.id}/logo?v=${sponsor.logoHash}`;

/** What the form shows of a sponsor that is edited. `enabled` is left out where Shown has no meaning, as in the library. */
export interface FormSponsor {
    name: string;
    link: string | null;
    gameBackground: string | null;
    enabled?: boolean;
    logoSrc: string;
    logoWidth: number;
    logoHeight: number;
}

/**
 * The add and edit form of a sponsor, at an event and in the library. Without `sponsor` it adds
 * one and the logo is required. When editing, an empty logo field keeps the current logo. The
 * preview shows the logo in its tile. Without `withShown` the form has no Shown box. `note` is
 * a line above the buttons.
 */
export function SponsorForm({
    action,
    sponsor,
    title,
    submitLabel,
    onCancel,
    withShown = true,
    note,
}: {
    action: string;
    sponsor?: FormSponsor;
    title: string;
    submitLabel: string;
    onCancel: () => void;
    withShown?: boolean;
    note?: string;
}) {
    const id = useId();
    const [ownBackground, setOwnBackground] = useState(sponsor ? sponsor.gameBackground !== null : false);
    const [colour, setColour] = useState(sponsor?.gameBackground ?? '#ffffff');
    const [preview, setPreview] = useState<string | null>(null);
    const picked = useRef<File | null>(null);
    const name = useRef<HTMLInputElement>(null);

    useEffect(() => name.current?.focus(), []);

    // The preview is a data address, which the content security policy allows for images.
    const pickFile = (file: File | null) => {
        picked.current = file;
        if (!file) return setPreview(null);
        const reader = new FileReader();
        reader.onload = () => {
            if (picked.current === file && typeof reader.result === 'string') setPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const background = ownBackground ? colour : null;
    // A new file has no known size yet, so its width follows the image.
    const tile = preview ? { src: preview, width: undefined } : sponsor ? { src: sponsor.logoSrc, width: tileWidth(sponsor) } : null;
    return (
        <form method="post" action={action} encType="multipart/form-data" aria-labelledby={sponsor ? undefined : `${id}-title`} aria-label={sponsor ? title : undefined} className="admin-sponsor-form">
            {!sponsor && <h3 id={`${id}-title`}>{title}</h3>}
            <p>
                <label>
                    Name <input ref={name} name="name" required maxLength={MAX_NAME_LENGTH} defaultValue={sponsor?.name} autoComplete="off" />
                </label>
            </p>
            <p>
                <label>
                    Link <input name="link" type="url" maxLength={MAX_LINK_LENGTH} defaultValue={sponsor?.link ?? ''} placeholder="https://" autoComplete="off" />
                </label>
            </p>
            <FileField
                label={sponsor ? 'New logo' : 'Logo'}
                name="logo"
                accept={LOGO_ACCEPT}
                required={!sponsor}
                hint={sponsor ? `${LOGO_HINT} Leave it empty to keep the current logo.` : LOGO_HINT}
                onFileChange={pickFile}
            />
            <div className="admin-field">
                <div className="admin-field-label">
                    <span id={`${id}-background`} className="admin-field-title">
                        Background colour
                    </span>
                    <InfoButton label="About the background colour" textId={`${id}-background-help`}>
                        <p>The colour of the tile behind the logo, on the site, on the big screen and on the sponsor board in the game. A logo with transparent parts sits on this colour.</p>
                        <p>With Standard, the site and the big screen use a cream tile, and the game shows its board through the transparent parts.</p>
                    </InfoButton>
                </div>
                <div role="radiogroup" aria-labelledby={`${id}-background`} aria-describedby={`${id}-background-help`} className="admin-choice">
                    <label>
                        <input type="radio" name="ownBackground" value="off" checked={!ownBackground} onChange={() => setOwnBackground(false)} /> Standard
                    </label>
                    <label>
                        <input type="radio" name="ownBackground" value="on" checked={ownBackground} onChange={() => setOwnBackground(true)} /> Colour
                    </label>
                    <input
                        type="color"
                        name="gameBackground"
                        aria-label="Colour of the background"
                        value={colour}
                        onChange={(event) => {
                            setColour(event.currentTarget.value);
                            setOwnBackground(true);
                        }}
                    />
                </div>
            </div>
            <div className="admin-field">
                <span className="admin-field-title">Preview</span>
                {tile ? (
                    <SponsorTile src={tile.src} alt={`Preview of the logo of ${sponsor?.name ?? 'the new sponsor'}`} height={TILE_LOGO_HEIGHT} width={tile.width} background={background} />
                ) : (
                    <span className="admin-hint">Select a logo to see it here.</span>
                )}
            </div>
            {withShown && (
                <p>
                    <label>
                        <input name="enabled" type="checkbox" defaultChecked={sponsor?.enabled ?? true} /> Shown on the site, on the big screen and in the game
                    </label>
                </p>
            )}
            {note && <p className="admin-hint">{note}</p>}
            <div className="admin-actions">
                <button type="submit">{submitLabel}</button>
                <button type="button" className="admin-quiet" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}
