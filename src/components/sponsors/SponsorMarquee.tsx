'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import styles from './sponsors.module.css';
import { SponsorTile, type TileSponsor } from './SponsorTile';

export interface StripSponsor extends TileSponsor {
    id: number;
}

/**
 * The tiles of the strip. Still, it is one centred set. Moving, the set comes twice and the track
 * slides by one set, so the end meets the start. Only the first set is read out and reached with
 * Tab. The copy is hidden from screen readers and from the tab order.
 */
export function MarqueeTrack({ sponsors, moving, setRef }: { sponsors: StripSponsor[]; moving: boolean; setRef?: Ref<HTMLUListElement> }) {
    const set = (copy: boolean) => (
        <ul key={copy ? 'copy' : 'set'} ref={copy ? undefined : setRef} className={copy ? `${styles.set} ${styles.copy}` : styles.set} aria-hidden={copy || undefined}>
            {sponsors.map((sponsor) => (
                <li key={sponsor.id}>
                    <SponsorTile sponsor={sponsor} copy={copy} />
                </li>
            ))}
        </ul>
    );
    return (
        <div className={moving ? `${styles.track} ${styles.moving}` : styles.track} style={{ '--tiles': sponsors.length } as CSSProperties}>
            {set(false)}
            {moving && set(true)}
        </div>
    );
}

/**
 * The sponsor strip: one row of tiles. It moves sideways only when the tiles do not fit, and
 * stops while the pointer or the keyboard focus is on it. On the big screen nobody points or
 * tabs, so there it just moves. With reduced motion it never moves and the tiles wrap.
 */
export function SponsorMarquee({ sponsors, className, style }: { sponsors: StripSponsor[]; className?: string; style?: CSSProperties }) {
    const box = useRef<HTMLDivElement>(null);
    const first = useRef<HTMLUListElement>(null);
    const [moving, setMoving] = useState(false);
    useLayoutEffect(() => {
        const fit = () => setMoving(!!box.current && !!first.current && first.current.getBoundingClientRect().width > box.current.clientWidth);
        fit();
        const observer = new ResizeObserver(fit);
        if (box.current) observer.observe(box.current);
        return () => observer.disconnect();
    }, [sponsors]);
    if (sponsors.length === 0) return null;
    return (
        <div ref={box} className={className ? `${styles.marquee} ${className}` : styles.marquee} style={style}>
            <MarqueeTrack sponsors={sponsors} moving={moving} setRef={first} />
        </div>
    );
}
