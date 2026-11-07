// Whether the game server talks to the site. No database or browser access, so it can be tested on its own.

/** A report newer than this counts as healthy. The game server syncs every few seconds. */
export const HEALTHY_MS = 60_000;
/** How often the admin page asks again. */
export const HEALTH_REFRESH_MS = 5_000;

/** What the admin page knows: the age of the last report in seconds, or why it could not ask. */
export type HealthState = { kind: 'age'; ageSeconds: number | null } | { kind: 'failed' } | { kind: 'signed-out' };

/** The line on the admin page, and whether it shows green. */
export function healthLine(state: HealthState): { text: string; ok: boolean } {
    if (state.kind === 'failed') return { text: 'Health check failed. Trying again.', ok: false };
    if (state.kind === 'signed-out') return { text: 'Health check failed. Sign in again.', ok: false };
    if (state.ageSeconds === null) return { text: 'Last report: never', ok: false };
    return { text: `Last report: ${state.ageSeconds} s ago`, ok: state.ageSeconds * 1000 < HEALTHY_MS };
}
