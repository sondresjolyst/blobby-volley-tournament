// Whether the game server talks to the site. No database or browser access, so it can be tested on its own.

/** A report newer than this counts as healthy. The game server syncs every few seconds. */
export const HEALTHY_MS = 60_000;
/** How often the admin page asks again. */
export const HEALTH_REFRESH_MS = 5_000;

/** Whole seconds since the last report, or null when no report came. A time ahead of now counts as now. */
export function reportAge(lastReportAt: Date | null, now: Date): number | null {
    if (lastReportAt === null) return null;
    return Math.max(0, Math.floor((now.getTime() - lastReportAt.getTime()) / 1000));
}

/** The line on the admin page, and whether it shows green. */
export function healthLine(ageSeconds: number | null): { text: string; ok: boolean } {
    if (ageSeconds === null) return { text: 'Last report: never', ok: false };
    return { text: `Last report ${ageSeconds} s ago`, ok: ageSeconds * 1000 < HEALTHY_MS };
}
