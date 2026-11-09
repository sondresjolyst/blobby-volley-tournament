'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import styles from './sponsors.module.css';
import { SponsorTile, type TileSponsor } from './SponsorTile';

export interface StripSponsor extends TileSponsor {
    id: number;
}

/**
 * How many sets of tiles the track needs so the strip is full at every moment while it slides by
 * one set: enough sets to cover the box, plus one that slides in. Never fewer than two.
 */
export function setsToFill(boxWidth: number, setWidth: number, gap: number): number {
    const step = setWidth + gap;
    if (!(step > 0) || !Number.isFinite(boxWidth)) return 2;
    return Math.max(2, Math.ceil(boxWidth / step) + 1);
}

/**
 * The tiles of the strip. The set comes `sets` times and the track slides by one set, so the end
 * meets the start. Only the first set is read out and reached with Tab. The copies are hidden from
 * screen readers and from the tab order.
 */
export function MarqueeTrack({ sponsors, sets = 2, setRef }: { sponsors: StripSponsor[]; sets?: number; setRef?: Ref<HTMLUListElement> }) {
    const set = (n: number) => {
        const copy = n > 0;
        return (
            <ul key={n} ref={copy ? undefined : setRef} className={copy ? `${styles.set} ${styles.copy}` : styles.set} aria-hidden={copy || undefined}>
                {sponsors.map((sponsor) => (
                    <li key={sponsor.id}>
                        <SponsorTile sponsor={sponsor} copy={copy} />
                    </li>
                ))}
            </ul>
        );
    };
    const count = Math.max(2, Math.floor(sets));
    return (
        // data-sponsor-track names the track for tests, since the class name is made at build time.
        <div className={styles.track} style={{ '--tiles': sponsors.length, '--sets': count } as CSSProperties} data-sponsor-track="">
            {Array.from({ length: count }, (_, n) => set(n))}
        </div>
    );
}

/**
 * The sponsor strip: one row of tiles that always moves sideways, at every width and with any
 * number of sponsors. The set is repeated until the strip is full. It stops while the pointer or
 * the keyboard focus is on it. On the big screen nobody points or tabs, so there it just moves.
 * With reduced motion it never moves and the tiles wrap.
 */
export function SponsorMarquee({ sponsors, className, style }: { sponsors: StripSponsor[]; className?: string; style?: CSSProperties }) {
    const box = useRef<HTMLDivElement>(null);
    const first = useRef<HTMLUListElement>(null);
    const [sets, setSets] = useState(2);
    useLayoutEffect(() => {
        const fit = () => {
            if (!box.current || !first.current) return;
            const gap = parseFloat(getComputedStyle(first.current.parentElement ?? first.current).columnGap) || 0;
            setSets(setsToFill(box.current.clientWidth, first.current.getBoundingClientRect().width, gap));
        };
        fit();
        const observer = new ResizeObserver(fit);
        if (box.current) observer.observe(box.current);
        return () => observer.disconnect();
    }, [sponsors]);
    if (sponsors.length === 0) return null;
    return (
        <div ref={box} className={className ? `${styles.marquee} ${className}` : styles.marquee} style={style}>
            <MarqueeTrack sponsors={sponsors} sets={sets} setRef={first} />
        </div>
    );
}
