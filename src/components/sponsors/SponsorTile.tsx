import type { CSSProperties } from 'react';

/** The frame of a sponsor tile in the design: rounded corners and a thin brown stroke. */
export const TILE_FRAME = { borderRadius: 12, border: '1px solid #5a4033' } as const;

/**
 * A sponsor logo in its tile: the frame, and the background colour of the sponsor behind the logo,
 * or nothing when the logo stays transparent.
 */
export function SponsorTile({ src, alt, width, height, background }: { src: string; alt: string; width?: number; height: number; background: string | null }) {
    const style: CSSProperties = {
        ...TILE_FRAME,
        display: 'inline-flex',
        padding: 6,
        background: background ?? 'transparent',
        boxSizing: 'content-box',
        maxWidth: '100%',
    };
    return (
        <span style={style}>
            {/* The logo is served as it was stored. The image optimizer of Next is not used. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} width={width} height={height} style={{ display: 'block', width: 'auto', height, maxWidth: '100%', objectFit: 'contain' }} />
        </span>
    );
}
