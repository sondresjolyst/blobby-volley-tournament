// The screens the big screen can take turns on, and the admin form that picks them. No database
// access, so it can be tested on its own.

/** Every screen, in the order the admin page lists them first. */
export const SCREEN_TYPES = ['overview', 'bracket', 'foza', 'next', 'stats', 'sponsors', 'winner'] as const;
export type ScreenType = (typeof SCREEN_TYPES)[number];

/** How long each screen stays up, in seconds. */
export const MIN_SCREEN_SECONDS = 10;
export const MAX_SCREEN_SECONDS = 600;
export const DEFAULT_SCREEN_SECONDS = 60;

export interface ScreenRotation {
    /** The screens that take turns, in order. Never empty. One screen means no rotation. */
    screens: ScreenType[];
    /** How long each screen stays up. */
    seconds: number;
}

/** What an event shows until an admin picks more: the overview alone. */
export const DEFAULT_ROTATION: ScreenRotation = { screens: ['overview'], seconds: DEFAULT_SCREEN_SECONDS };

/** Reads a screen name, such as the `?screen=` of the big screen address, or null. */
export function parseScreenType(value: unknown): ScreenType | null {
    return typeof value === 'string' && (SCREEN_TYPES as readonly string[]).includes(value) ? (value as ScreenType) : null;
}

export const isScreenSeconds = (n: number) => Number.isInteger(n) && n >= MIN_SCREEN_SECONDS && n <= MAX_SCREEN_SECONDS;

export type RotationInputResult = { ok: true; value: ScreenRotation } | { ok: false; error: 'bigScreenNone' | 'bigScreenSeconds' };

/**
 * Reads the rotation form of the event page. Each screen has a checkbox `show_<screen>` and a
 * number `order_<screen>`. The checked screens are put in order by the numbers. Screens with the
 * same number or no number keep the order of SCREEN_TYPES.
 */
export function parseRotationInput(form: Record<string, unknown>): RotationInputResult {
    const raw = typeof form.seconds === 'string' ? form.seconds.trim() : '';
    const seconds = /^[0-9]{1,4}$/.test(raw) ? Number(raw) : NaN;
    if (!isScreenSeconds(seconds)) return { ok: false, error: 'bigScreenSeconds' };
    const order = (type: ScreenType) => {
        const value = form[`order_${type}`];
        return typeof value === 'string' && /^[0-9]{1,2}$/.test(value.trim()) ? Number(value.trim()) : Number.MAX_SAFE_INTEGER;
    };
    const screens = SCREEN_TYPES.filter((type) => form[`show_${type}`] === 'on')
        .map((type, i) => ({ type, at: order(type), i }))
        .sort((a, b) => a.at - b.at || a.i - b.i)
        .map((s) => s.type);
    if (screens.length === 0) return { ok: false, error: 'bigScreenNone' };
    return { ok: true, value: { screens, seconds } };
}

/** A stored rotation, cleaned up: unknown and repeated screens are dropped, and an empty one is the default. */
export function toRotation(screens: readonly string[] | null | undefined, seconds: number | null | undefined): ScreenRotation {
    const known = [...new Set((screens ?? []).map(parseScreenType).filter((s): s is ScreenType => s !== null))];
    return {
        screens: known.length > 0 ? known : [...DEFAULT_ROTATION.screens],
        seconds: typeof seconds === 'number' && isScreenSeconds(seconds) ? seconds : DEFAULT_SCREEN_SECONDS,
    };
}
