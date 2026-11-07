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

/** The screen on show now. The current one while it can still show, otherwise the first that can. */
export function currentScreen(data: ScreenContent, current: ScreenType | null): ScreenType {
    const shown = rotatingScreens(data);
    return shown.find((type) => type === current) ?? shown[0];
}

/** The screen after a tick. With one screen it stays. A screen that went away starts the turn over. */
export function nextScreen(data: ScreenContent, current: ScreenType | null): ScreenType {
    const shown = rotatingScreens(data);
    const at = shown.indexOf(current as ScreenType);
    return shown[(at + 1) % shown.length];
}

/**
 * The screen to draw. A screen pinned with `?screen=` in the address always wins, so a second TV
 * can stay on it. The winner screen is the one exception: it waits on the overview until there is
 * a winner.
 */
export function shownScreen(data: ScreenContent, current: ScreenType | null, pinned: ScreenType | null): ScreenType {
    if (pinned === 'winner' && data.winner === null) return 'overview';
    return pinned ?? currentScreen(data, current);
}

/** How long each screen stays up, in milliseconds. */
export const screenMs = (data: ScreenContent) => data.rotation.seconds * 1000;
