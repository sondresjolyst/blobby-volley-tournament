'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './sponsors.module.css';
import { SponsorTile, type TileSponsor } from './SponsorTile';

export interface StripSponsor extends TileSponsor {
    id: number;
}

/**
 * The sponsor strip: one row of tiles that moves sideways forever and stops while the pointer or
 * the focus is on it. The set repeats until it is wider than the strip, so a few sponsors still
 * move without a gap. Only the first set is read out and reached with Tab. The copies are hidden.
 * With reduced motion it stands still and shows one set.
 */
export function SponsorMarquee({ sponsors, className, style }: { sponsors: StripSponsor[]; className?: string; style?: CSSProperties }) {
    const box = useRef<HTMLDivElement>(null);
    const first = useRef<HTMLUListElement>(null);
    const [repeat, setRepeat] = useState(1);
    useLayoutEffect(() => {
        const fit = () => {
            const set = first.current?.getBoundingClientRect().width ?? 0;
            const room = box.current?.clientWidth ?? 0;
            if (set > 0) setRepeat(Math.max(1, Math.ceil(room / set)));
        };
        fit();
        const observer = new ResizeObserver(fit);
        if (box.current) observer.observe(box.current);
        return () => observer.disconnect();
    }, [sponsors]);
    if (sponsors.length === 0) return null;
    const set = (copy: boolean, key: number) => (
        <ul key={key} ref={copy ? undefined : first} className={copy ? `${styles.set} ${styles.copy}` : styles.set} aria-hidden={copy || undefined}>
            {sponsors.map((sponsor) => (
                <li key={sponsor.id}>
                    <SponsorTile sponsor={sponsor} copy={copy} />
                </li>
            ))}
        </ul>
    );
    // The first half of the track is the set and its repeats, the second half the same again.
    const sets = Array.from({ length: repeat * 2 }, (_, i) => set(i > 0, i));
    return (
        <div ref={box} className={className ? `${styles.marquee} ${className}` : styles.marquee} style={style}>
            <div className={styles.track} style={{ '--tiles': sponsors.length * repeat } as CSSProperties}>
                {sets}
            </div>
        </div>
    );
}
