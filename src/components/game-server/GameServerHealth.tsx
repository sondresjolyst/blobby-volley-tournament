'use client';

import { useEffect, useState } from 'react';
import { HEALTH_REFRESH_MS, healthLine, type HealthState } from '@/lib/game-server/health';
import { usePolling } from '../usePolling';

/**
 * The time since the last recorded call of the game server. It counts up every second and asks the
 * site again every few seconds without a page load. When a check fails it says so and stops counting
 * until a check works again.
 */
export function GameServerHealth({ initialAge }: { initialAge: number | null }) {
    const [state, setState] = useState<HealthState>({ kind: 'age', ageSeconds: initialAge });
    const counting = state.kind === 'age' && state.ageSeconds !== null;

    useEffect(() => {
        if (!counting) return;
        const tick = setInterval(() => setState((s) => (s.kind === 'age' && s.ageSeconds !== null ? { kind: 'age', ageSeconds: s.ageSeconds + 1 } : s)), 1000);
        return () => clearInterval(tick);
    }, [counting]);

    usePolling<{ ageSeconds: number | null }>('/api/admin/game-server/health', HEALTH_REFRESH_MS, (result) => {
        if (result.ok) setState({ kind: 'age', ageSeconds: result.data.ageSeconds });
        else setState({ kind: result.status === 401 || result.status === 403 ? 'signed-out' : 'failed' });
    });

    const { text, ok } = healthLine(state);
    return (
        <p className="admin-health" data-ok={ok}>
            {text}
        </p>
    );
}
