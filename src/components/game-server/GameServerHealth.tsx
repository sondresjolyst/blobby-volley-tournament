'use client';

import { useEffect, useState } from 'react';
import { HEALTH_REFRESH_MS, healthLine } from '@/lib/game-server/health';

/**
 * The time since the last call of the game server. It counts up every second and asks the site
 * again every few seconds without a page load, as the big screen does.
 */
export function GameServerHealth({ initialAge }: { initialAge: number | null }) {
    const [age, setAge] = useState(initialAge);

    useEffect(() => {
        const tick = setInterval(() => setAge((value) => (value === null ? null : value + 1)), 1000);
        return () => clearInterval(tick);
    }, []);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const refresh = async () => {
            try {
                const res = await fetch('/api/admin/game-server/health', { cache: 'no-store' });
                if (res.ok) {
                    const body = (await res.json()) as { ageSeconds: number | null };
                    if (!stopped) setAge(body.ageSeconds);
                }
            } catch {
                // The line keeps counting and tries again.
            }
            if (!stopped) timer = setTimeout(refresh, HEALTH_REFRESH_MS);
        };
        timer = setTimeout(refresh, HEALTH_REFRESH_MS);
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, []);

    const { text, ok } = healthLine(age);
    return (
        <p className="admin-health" data-ok={ok}>
            {text}
        </p>
    );
}
