// The timers of the big screen. No browser access, so it can be tested on its own.
import type { ScreenType } from './screens';
import type { BigScreenData, BoardKey, ScreenBoard } from './view';

/** How long each leaderboard stays up. */
export const ROTATION_MS = 12_000;
/** How often the page reads the scores again. */
export const REFRESH_MS = 5_000;

/** The boards that take turns. Empty boards are skipped, unless all are empty, then the first one stays. */
export function rotatingBoards(boards: readonly ScreenBoard[]): ScreenBoard[] {
    const filled = boards.filter((b) => b.rows.length > 0);
    if (filled.length > 0) return filled;
    return boards.slice(0, 1);
}

/**
 * The board to show after a tick. It keeps to the same board when the list changes under it, and
 * moves to the next one in turn. A board that went away starts the turn over.
 */
export function nextBoard(boards: readonly ScreenBoard[], current: BoardKey | null): BoardKey | null {
    const shown = rotatingBoards(boards);
    if (shown.length === 0) return null;
    const at = shown.findIndex((b) => b.key === current);
    return shown[(at + 1) % shown.length].key;
}

/** The board on screen now. The current one if it can still be shown, otherwise the first that can. */
export function currentBoard(boards: readonly ScreenBoard[], current: BoardKey | null): ScreenBoard | null {
    const shown = rotatingBoards(boards);
    return shown.find((b) => b.key === current) ?? shown[0] ?? null;
}

/** What decides which screens can show. */
export type ScreenContent = Pick<BigScreenData, 'rotation' | 'fullBracket' | 'upNext' | 'foza' | 'facts' | 'sponsors' | 'winner'>;

/** True when the screen has something to show. The overview always has. */
export function screenHasContent(type: ScreenType, data: ScreenContent): boolean {
    switch (type) {
        case 'overview':
            return true;
        case 'bracket':
            return data.fullBracket !== null;
        case 'foza':
            return data.foza.bettors.length > 0;
        case 'next':
            return data.upNext.length > 0;
        case 'stats':
            return data.facts.length > 0;
        case 'sponsors':
            return data.sponsors.length > 0;
        case 'winner':
            return data.winner !== null;
    }
}

/**
 * The screens that take turns, in the order the admin set. A screen with nothing to show is
 * skipped. When none of them has anything, the first one stays up with its empty text, but never
 * the winner screen before there is a winner. Then the overview stands in.
 */
export function rotatingScreens(data: ScreenContent): ScreenType[] {
    const filled = data.rotation.screens.filter((type) => screenHasContent(type, data));
    if (filled.length > 0) return filled;
    return [data.rotation.screens.find((type) => type !== 'winner') ?? 'overview'];
}

/**
 * The turn on show, as a place in the screens of the rotation. It is `turn` while that screen has
 * something to show, otherwise the next one in order that has. Null when none has.
 */
function filledTurn(data: ScreenContent, turn: number, from = 0): number | null {
    const { screens } = data.rotation;
    for (let step = from; step < screens.length + from; step++) {
        const at = (((turn + step) % screens.length) + screens.length) % screens.length;
        if (screenHasContent(screens[at], data)) return at;
    }
    return null;
}

/**
 * The screen on show for a turn. A screen that has nothing to show any more gives way to the next
 * one in order, so the turn goes on from there and never starts over.
 */
export function currentScreen(data: ScreenContent, turn: number): ScreenType {
    const at = filledTurn(data, turn);
    return at === null ? rotatingScreens(data)[0] : data.rotation.screens[at];
}

/** The turn after a tick: the next screen in order after the one on show that has something to show. With one screen it stays. */
export function nextTurn(data: ScreenContent, turn: number): number {
    const at = filledTurn(data, turn);
    return at === null ? turn : (filledTurn(data, at, 1) ?? at);
}

/**
 * The screen to draw. A screen pinned with `?screen=` in the address always wins, so a second TV
 * can stay on it. The winner screen is the one exception: it waits on the overview until there is
 * a winner.
 */
export function shownScreen(data: ScreenContent, turn: number, pinned: ScreenType | null): ScreenType {
    if (pinned === 'winner' && data.winner === null) return 'overview';
    return pinned ?? currentScreen(data, turn);
}

/**
 * Moves the turn on every `ms` milliseconds, from the latest data `read` gives. A pinned screen
 * has no turns. Returns the stop, for the cleanup of the effect that starts it. The effect starts
 * it again when the time or the screens change, so the new time counts from then.
 */
export function startScreenTurns(ms: number, pinned: ScreenType | null, read: () => ScreenContent, advance: (next: (turn: number) => number) => void): () => void {
    if (pinned !== null) return () => {};
    const timer = setInterval(() => advance((turn) => nextTurn(read(), turn)), ms);
    return () => clearInterval(timer);
}

/** How long each screen stays up, in milliseconds. */
export const screenMs = (data: ScreenContent) => data.rotation.seconds * 1000;
