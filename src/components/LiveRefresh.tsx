'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './LiveRefresh.module.css';
import { usePolling } from './usePolling';

/** How often an open player page asks whether anything changed. */
export const LIVE_REFRESH_MS = 5000;

/** How long the hint shows after the page loaded new things. */
const HINT_MS = 3000;

/**
 * Loads the page again when the live stamp of its event changes, such as a new 1v1 match, an
 * answer to one, a call, a result, a bet or a payout. It only reads the short stamp while nothing
 * changes, and pauses in a hidden tab. After a load it shows a small hint for a few seconds.
 * The page reads `stamp` before the rest of its data, so a change during the reads loads it once more.
 */
export function LiveRefresh({ eventId, stamp }: { eventId: number; stamp: string }) {
    const router = useRouter();
    const last = useRef(stamp);
    const [hint, setHint] = useState(false);
    useEffect(() => {
        last.current = stamp;
    }, [stamp]);
    useEffect(() => {
        if (!hint) return;
        const timer = setTimeout(() => setHint(false), HINT_MS);
        return () => clearTimeout(timer);
    }, [hint]);
    usePolling<{ stamp: string }>(
        `/api/live?event=${eventId}`,
        LIVE_REFRESH_MS,
        (result) => {
            if (!result.ok || result.data.stamp === last.current) return;
            last.current = result.data.stamp;
            router.refresh();
            setHint(true);
        },
        { pauseWhenHidden: true },
    );
    return (
        <p aria-live="polite" className={`${styles.hint} ${hint ? styles.shown : ''}`}>
            {hint ? 'Nytt på sidå' : ''}
        </p>
    );
}
