'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePolling } from '../usePolling';

/** How often /me asks whether a match of the player changed. */
export const MATCHES_REFRESH_MS = 5000;

/**
 * Loads /me again when a match of the player changes, such as a new 1v1 match, an answer to one, a
 * call or a result. It only reads a short stamp while nothing changes, and pauses in a hidden tab.
 */
export function MatchesRefresh({ stamp }: { stamp: string }) {
    const router = useRouter();
    const last = useRef(stamp);
    useEffect(() => {
        last.current = stamp;
    }, [stamp]);
    usePolling<{ stamp: string }>(
        '/api/player/matches',
        MATCHES_REFRESH_MS,
        (result) => {
            if (!result.ok || result.data.stamp === last.current) return;
            last.current = result.data.stamp;
            router.refresh();
        },
        { pauseWhenHidden: true },
    );
    return null;
}
