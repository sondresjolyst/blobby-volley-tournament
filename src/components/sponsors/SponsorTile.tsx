import type { CSSProperties } from 'react';
import { TILE_RADIUS, TILE_STROKE, tileBackground } from '@/lib/sponsors/tile';

/** The frame and colour of a sponsor tile, for the places that draw their own tile element. */
export const tileStyle = (background: string | null): CSSProperties => ({
    borderRadius: TILE_RADIUS,
    border: `1px solid ${TILE_STROKE}`,
    background: tileBackground(background),
});

/** A sponsor logo in its tile, as the site shows it: the frame and the background colour of the sponsor. */
export function SponsorTile({ src, alt, width, height, background }: { src: string; alt: string; width?: number; height: number; background: string | null }) {
    const style: CSSProperties = {
        ...tileStyle(background),
        display: 'inline-flex',
        padding: 6,
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
