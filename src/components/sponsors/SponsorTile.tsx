import type { CSSProperties } from 'react';
import { tileBackground } from '@/lib/sponsors/tile';
import styles from './sponsors.module.css';

export interface TileSponsor {
    name: string;
    src: string;
    link?: string | null;
    background: string | null;
}

/**
 * A sponsor logo in its tile, the same everywhere: the frame, the background colour of the sponsor
 * and the logo filling the tile, centred both ways. With a link the tile is the link. A `copy` is
 * hidden from screen readers and from the tab order, for the moving strip.
 */
export function SponsorTile({ sponsor, alt = sponsor.name, copy = false, className, style }: { sponsor: TileSponsor; alt?: string; copy?: boolean; className?: string; style?: CSSProperties }) {
    const tileStyle: CSSProperties = { background: tileBackground(sponsor.background), ...style };
    const cls = className ? `${styles.tile} ${className}` : styles.tile;
    // The logo is served as it was stored. The image optimizer of Next is not used.
    // eslint-disable-next-line @next/next/no-img-element
    const logo = <img className={styles.logo} src={sponsor.src} alt={copy ? '' : alt} />;
    if (sponsor.link) {
        return (
            <a className={cls} style={tileStyle} href={sponsor.link} rel="sponsored noopener noreferrer" tabIndex={copy ? -1 : undefined}>
                {logo}
            </a>
        );
    }
    return (
        <span className={cls} style={tileStyle}>
            {logo}
        </span>
    );
}
