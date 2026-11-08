'use client';

import { useEffect, useEffectEvent } from 'react';

/** One poll: the JSON body of an OK answer, or the status of a failed one. The status is null when the site could not be reached. */
export type PollResult<T> = { ok: true; data: T } | { ok: false; status: number | null };

/**
 * Reads a JSON address every `ms` milliseconds without a page load, the first time `ms` after the
 * page shows. The next read is planned when the last one is done, so slow answers never pile up.
 * A new address starts over. The address may hold a key, so no referrer is sent. With
 * `pauseWhenHidden` it does not read while the tab is hidden, and reads at once when it shows again.
 */
export function usePolling<T>(url: string, ms: number, onResult: (result: PollResult<T>) => void, { pauseWhenHidden = false } = {}): void {
    const handle = useEffectEvent(onResult);
    useEffect(() => {
        let stopped = false;
        let paused = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            if (pauseWhenHidden && document.hidden) {
                paused = true;
                return;
            }
            let result: PollResult<T>;
            try {
                const res = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
                result = res.ok ? { ok: true, data: (await res.json()) as T } : { ok: false, status: res.status };
            } catch {
                result = { ok: false, status: null };
            }
            if (stopped) return;
            handle(result);
            timer = setTimeout(poll, ms);
        };
        const resume = () => {
            if (!paused || document.hidden) return;
            paused = false;
            void poll();
        };
        timer = setTimeout(poll, ms);
        if (pauseWhenHidden) document.addEventListener('visibilitychange', resume);
        return () => {
            stopped = true;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', resume);
        };
    }, [url, ms, pauseWhenHidden]);
}
